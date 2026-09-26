// POST /api/review-summary: a cached summary from R2, or one generated on the
// first request after an instructor gets new reviews (DATA.md §7.2). It
// reads PlanetTerp's reviews and our published ones (V2 §7.6).
import { createdMonth } from "~/core/reviews";
import {
  FeatureVarsSchema,
  type Instructor,
  JOBS_PREFIX,
  planetTerpReviewsKey,
  type ReviewSummary,
  type ReviewSummaryInput,
  type ReviewSummaryResult,
  ReviewSummarySchema,
  StoredReviewsSchema,
  summaryKey,
} from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { hit } from "../counters";
import {
  DEFAULT_HEDGE_AFTER_MS,
  DEFAULT_TIMEOUT_MS,
  GUARD_MODEL,
  runGuard,
} from "../moderation/models";
import { readPlanetTerpDept } from "../planetterp";
import {
  getInstructor,
  publishedForSummary,
  publishedStats,
} from "../reviews/store";
import { fetchPlanetTerpReviews } from "./planetterp-api";
import {
  buildSummaryMessages,
  MAX_REVIEWS,
  type ModelSummary,
  type PromptReview,
  parseModelOutput,
  SUMMARY_JSON_SCHEMA,
  SUMMARY_MODEL,
} from "./prompt";

export interface SummaryEnv {
  DATA: R2Bucket;
  DB: D1Database;
  AI: Ai;
  SUMMARIES_DAILY_CAP?: string;
  POSTHOG_TOKEN?: string;
  /** Our reviews count toward summaries once Reviews is at least readable. */
  REVIEWS_ENABLED?: string;
}

export interface SummaryDeps {
  now: Date;
  fetcher?: typeof fetch;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** How long a request waits for another one's generation (ms). */
  waitForOthersMs?: number;
  /** Poll interval while waiting (ms). */
  pollMs?: number;
}

const DEFAULT_DAILY_CAP = 200;
const LOCK_TTL_MS = 60_000;
const lockKey = (slug: string) => `${JOBS_PREFIX}summary-locks/${slug}.json`;

/** Generations in flight in this isolate, so concurrent requests share one. */
const inFlight = new Map<string, Promise<ReviewSummaryResult>>();

const unavailable = (
  reason: Extract<ReviewSummaryResult, { status: "unavailable" }>["reason"],
) => ({ status: "unavailable", reason }) as const;

/** The instructor as the department's PlanetTerp file has them, or null. */
export async function findInstructor(
  bucket: R2Bucket,
  slug: string,
  course: string,
): Promise<Instructor | null> {
  const file = await readPlanetTerpDept(bucket, course.slice(0, 4));
  return file?.instructors[slug] ?? null;
}

/**
 * Who a summary is about: PlanetTerp's record (if it has one) and our
 * published reviews, with the combined count and newest review that decide
 * freshness. Our newest is rounded to its month, as readers see it (V2
 * §7.5), since a summary's `latestReviewAt` reaches the browser.
 */
interface Subject {
  slug: string;
  name: string;
  planetTerp: Instructor | null;
  terpsicleCount: number;
  reviewCount: number;
  latestReviewAt: string | null;
}

const monthStart = (iso: string) => `${createdMonth(iso)}-01T00:00:00.000Z`;
const newest = (times: readonly (string | null | undefined)[]) =>
  times
    .filter((t): t is string => typeof t === "string")
    .map((t) => new Date(t).toISOString())
    .sort()
    .pop() ?? null;

async function findSubject(
  env: SummaryEnv,
  slug: string,
  course: string,
): Promise<Subject | "unknown-instructor" | "no-reviews"> {
  const planetTerp = await findInstructor(env.DATA, slug, course);
  const ours =
    FeatureVarsSchema.parse(env).REVIEWS_ENABLED === "off"
      ? { count: 0, latestPublishedAt: null }
      : await publishedStats(env.DB, slug);
  if (!planetTerp && ours.count === 0)
    return (await getInstructor(env.DB, slug).catch(() => null))
      ? "no-reviews"
      : "unknown-instructor";
  const reviewCount = (planetTerp?.reviewCount ?? 0) + ours.count;
  if (reviewCount === 0) return "no-reviews";
  const name =
    planetTerp?.name ?? (await getInstructor(env.DB, slug))?.name ?? slug;
  return {
    slug,
    name,
    planetTerp,
    terpsicleCount: ours.count,
    reviewCount,
    latestReviewAt: newest([
      planetTerp?.latestReviewAt,
      ours.latestPublishedAt ? monthStart(ours.latestPublishedAt) : null,
    ]),
  };
}

/**
 * Fresh when it saw at least as many reviews, and the newest one, and
 * exactly as many of ours: a review of ours taken down makes it stale, so
 * the summary never keeps describing words readers can no longer see.
 */
export function isFresh(
  summary: ReviewSummary,
  instructor: Pick<Instructor, "reviewCount" | "latestReviewAt">,
  terpsicleCount = 0,
): boolean {
  if ((summary.sources?.terpsicle ?? 0) !== terpsicleCount) return false;
  if (summary.basedOnReviewCount < instructor.reviewCount) return false;
  if (instructor.latestReviewAt === null) return true;
  return (
    summary.latestReviewAt !== null &&
    summary.latestReviewAt >= instructor.latestReviewAt
  );
}

async function readSummary(
  bucket: R2Bucket,
  slug: string,
): Promise<ReviewSummary | null> {
  const object = await bucket.get(summaryKey(slug));
  if (!object) return null;
  const parsed = ReviewSummarySchema.safeParse(await object.json());
  return parsed.success ? parsed.data : null;
}

/**
 * A lock object in R2, taken with a create-only put. A lock older than its
 * TTL (a crashed generation) is taken over with an etag-conditional put, so
 * exactly one request wins either way.
 */
async function acquireLock(
  bucket: R2Bucket,
  slug: string,
  now: Date,
): Promise<boolean> {
  const body = JSON.stringify({
    expiresAt: new Date(now.getTime() + LOCK_TTL_MS).toISOString(),
  });
  const created = await bucket.put(lockKey(slug), body, {
    onlyIf: { etagDoesNotMatch: "*" },
  });
  if (created) return true;
  const existing = await bucket.get(lockKey(slug));
  if (!existing) {
    return (
      (await bucket.put(lockKey(slug), body, {
        onlyIf: { etagDoesNotMatch: "*" },
      })) !== null
    );
  }
  const { expiresAt } = (await existing.json()) as { expiresAt?: string };
  if (typeof expiresAt === "string" && expiresAt > now.toISOString())
    return false;
  const takenOver = await bucket.put(lockKey(slug), body, {
    onlyIf: { etagMatches: existing.etag },
  });
  return takenOver !== null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Generated =
  | { ok: true; value: ModelSummary; attempts: number }
  | { ok: false; reason: "model-output" | "model-error" };

async function runModel(
  ai: Ai,
  messagesFor: (retryNote?: string) => ReturnType<typeof buildSummaryMessages>,
): Promise<Generated> {
  let note: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: unknown;
    try {
      const output = await ai.run(SUMMARY_MODEL, {
        messages: messagesFor(note),
        response_format: {
          type: "json_schema",
          json_schema: SUMMARY_JSON_SCHEMA,
        },
        max_tokens: 400,
        temperature: 0.2,
      });
      response = (output as { response?: unknown }).response;
    } catch (error) {
      console.warn({ summary: "model error", error: String(error) });
      if (attempt === 2) return { ok: false, reason: "model-error" };
      continue;
    }
    const parsed = parseModelOutput(response);
    if (parsed.ok) return { ok: true, value: parsed.value, attempts: attempt };
    note = parsed.error;
  }
  return { ok: false, reason: "model-output" };
}

/** The review text the PlanetTerp job keeps (DATA.md §2.6), or null when there's none. */
export async function readStoredReviews(
  bucket: R2Bucket,
  slug: string,
): Promise<PromptReview[] | null> {
  const object = await bucket.get(planetTerpReviewsKey(slug));
  if (!object) return null;
  const parsed = StoredReviewsSchema.safeParse(await object.json());
  if (!parsed.success || parsed.data.slug !== slug) return null;
  return parsed.data.reviews.map((r) => ({
    course: r.course,
    text: r.text,
    rating: r.rating,
    created: r.created,
  }));
}

/**
 * The reviews to summarize: the stored copy when it has every review the
 * instructor's file counts, else PlanetTerp live, else whatever is stored
 * (so summaries can still be regenerated if PlanetTerp is down or gone).
 * Null when there's nothing to summarize from.
 */
async function reviewsFor(
  bucket: R2Bucket,
  instructor: Instructor,
  deps: SummaryDeps,
): Promise<PromptReview[] | null> {
  const stored = await readStoredReviews(bucket, instructor.slug).catch(
    (error: unknown) => {
      console.warn({ summary: "stored reviews error", error: String(error) });
      return null;
    },
  );
  if (stored && stored.length >= instructor.reviewCount) return stored;
  const fallback = stored && stored.length > 0 ? stored : null;
  let professor: Awaited<ReturnType<typeof fetchPlanetTerpReviews>>;
  try {
    professor = await fetchPlanetTerpReviews(
      deps.fetcher ?? fetch,
      instructor.name,
    );
  } catch (error) {
    console.warn({ summary: "planetterp error", error: String(error) });
    return fallback;
  }
  // PlanetTerp looks professors up by name, and names collide: only a
  // matching slug is the right person.
  if (!professor || professor.slug !== instructor.slug) return fallback;
  return professor.reviews;
}

/** Our published reviews, newest first, as the prompt takes them. */
async function terpsicleReviews(
  env: SummaryEnv,
  subject: Subject,
): Promise<PromptReview[]> {
  if (subject.terpsicleCount === 0) return [];
  const rows = await publishedForSummary(env.DB, subject.slug, MAX_REVIEWS);
  return rows.map((r) => ({
    course: r.course,
    text: r.body,
    rating: r.rating,
    created: r.createdAt,
  }));
}

/**
 * Llama Guard on the summary before it's stored (V2 §7.6), for S5
 * (defamation) above all: the model restates what reviews say about a real
 * person. Anything unsafe, and any failure to check, isn't shown.
 */
async function guardSummary(
  ai: Ai,
  text: string,
): Promise<"safe" | "unsafe" | "failed"> {
  const verdict = await runGuard(ai, text, {
    model: GUARD_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    hedgeAfterMs: DEFAULT_HEDGE_AFTER_MS,
    // The daily summary cap already counted this generation.
    mayAttempt: async () => true,
  });
  if (!verdict.ok) return "failed";
  return verdict.value.safe ? "safe" : "unsafe";
}

async function generate(
  env: SummaryEnv,
  subject: Subject,
  deps: SummaryDeps,
): Promise<ReviewSummaryResult> {
  const { now } = deps;
  const track = <E extends Parameters<typeof captureServerEvent>[1]>(
    event: E,
    props: Parameters<typeof captureServerEvent<E>>[2],
  ) => deps.waitUntil?.(captureServerEvent(env, event, props));

  const cap =
    Number(env.SUMMARIES_DAILY_CAP ?? DEFAULT_DAILY_CAP) || DEFAULT_DAILY_CAP;
  if ((await hit(env.DB, "summaries", { seconds: 86_400 }, now)) > cap) {
    track("summary_capped", { cap });
    return unavailable("daily-limit");
  }

  const pt = subject.planetTerp;
  const theirs =
    pt && pt.reviewCount > 0 ? await reviewsFor(env.DATA, pt, deps) : [];
  if (theirs === null) {
    track("summary_failed", { reason: "planetterp" });
    return unavailable("failed");
  }
  const ours = await terpsicleReviews(env, subject);
  // The newest 40 of both, within the character budget (pickReviews).
  const reviews = [...theirs, ...ours];
  if (reviews.length === 0) return unavailable("no-reviews");

  const started = Date.now();
  const result = await runModel(env.AI, (note) =>
    buildSummaryMessages(subject.name, reviews, note),
  );
  if (!result.ok) {
    track("summary_failed", { reason: result.reason });
    return unavailable("failed");
  }
  const planetterp = Math.max(theirs.length, pt?.reviewCount ?? 0);
  const candidate = ReviewSummarySchema.safeParse({
    schemaVersion: 1,
    slug: subject.slug,
    summary: result.value.summary,
    themes: result.value.themes,
    basedOnReviewCount: planetterp + subject.terpsicleCount,
    // Ours only by month (see Subject); PlanetTerp's as they are.
    latestReviewAt: newest([
      ...theirs.map((r) => r.created),
      subject.latestReviewAt,
    ]),
    generatedAt: now.toISOString(),
    model: SUMMARY_MODEL,
    sources: { planetterp, terpsicle: subject.terpsicleCount },
  });
  if (!candidate.success) {
    track("summary_failed", { reason: "model-output" });
    return unavailable("failed");
  }
  const guard = await guardSummary(env.AI, candidate.data.summary);
  if (guard !== "safe") {
    track("summary_failed", {
      reason: guard === "unsafe" ? "unsafe" : "guard-error",
    });
    return unavailable("failed");
  }
  try {
    await env.DATA.put(
      summaryKey(subject.slug),
      JSON.stringify(candidate.data),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      },
    );
  } catch (error) {
    console.warn({ summary: "store error", error: String(error) });
    track("summary_failed", { reason: "storage" });
  }
  track("summary_generated", {
    model: SUMMARY_MODEL,
    durationMs: Date.now() - started,
    reviews: reviews.length,
    attempts: result.attempts,
  });
  return { status: "ok", summary: candidate.data };
}

export async function getReviewSummary(
  env: SummaryEnv,
  input: ReviewSummaryInput,
  deps: SummaryDeps,
): Promise<ReviewSummaryResult> {
  const subject = await findSubject(env, input.slug, input.course);
  if (typeof subject === "string") return unavailable(subject);
  const fresh = (summary: ReviewSummary) =>
    isFresh(summary, subject, subject.terpsicleCount);

  const cached = await readSummary(env.DATA, input.slug);
  if (cached && fresh(cached)) {
    const ageDays = Math.floor(
      (deps.now.getTime() - Date.parse(cached.generatedAt)) / 86_400_000,
    );
    deps.waitUntil?.(captureServerEvent(env, "summary_cached", { ageDays }));
    return { status: "ok", summary: cached };
  }

  const pending = inFlight.get(input.slug);
  if (pending) return pending;

  const work = (async (): Promise<ReviewSummaryResult> => {
    if (!(await acquireLock(env.DATA, input.slug, deps.now))) {
      // Another isolate is generating it: wait for it to land.
      const deadline = Date.now() + (deps.waitForOthersMs ?? 20_000);
      while (Date.now() < deadline) {
        await sleep(deps.pollMs ?? 1_000);
        const landed = await readSummary(env.DATA, input.slug);
        if (landed && fresh(landed)) return { status: "ok", summary: landed };
      }
      return unavailable("busy");
    }
    try {
      return await generate(env, subject, deps);
    } finally {
      await env.DATA.delete(lockKey(input.slug));
    }
  })();
  inFlight.set(input.slug, work);
  try {
    return await work;
  } finally {
    inFlight.delete(input.slug);
  }
}
