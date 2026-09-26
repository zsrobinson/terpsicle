// POST /api/review-summary: a cached summary from R2, or one generated on the
// first request after an instructor gets new reviews (DATA.md §7.2).
import {
  type Instructor,
  JOBS_PREFIX,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
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
import { fetchPlanetTerpReviews } from "./planetterp-api";
import {
  buildSummaryMessages,
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
  const manifestObject = await bucket.get(PLANETTERP_MANIFEST_KEY);
  if (!manifestObject) return null;
  const manifest = PlanetTerpManifestSchema.safeParse(
    await manifestObject.json(),
  );
  const dept = course.slice(0, 4);
  const entry = manifest.success
    ? manifest.data.departments.find((d) => d.code === dept)
    : undefined;
  if (!entry) return null;
  const deptObject = await bucket.get(planetTerpDeptKey(dept, entry.hash));
  if (!deptObject) return null;
  const file = PlanetTerpDeptSchema.safeParse(await deptObject.json());
  return file.success ? (file.data.instructors[slug] ?? null) : null;
}

/** Fresh when it saw at least as many reviews, and the newest one. */
export function isFresh(
  summary: ReviewSummary,
  instructor: Instructor,
): boolean {
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

async function generate(
  env: SummaryEnv,
  instructor: Instructor,
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

  const reviews = await reviewsFor(env.DATA, instructor, deps);
  if (reviews === null) {
    track("summary_failed", { reason: "planetterp" });
    return unavailable("failed");
  }
  if (reviews.length === 0) return unavailable("no-reviews");

  const started = Date.now();
  const result = await runModel(env.AI, (note) =>
    buildSummaryMessages(instructor.name, reviews, note),
  );
  if (!result.ok) {
    track("summary_failed", { reason: result.reason });
    return unavailable("failed");
  }
  const newest = reviews.reduce<string | null>(
    (max, r) => (max === null || r.created > max ? r.created : max),
    null,
  );
  const candidate = ReviewSummarySchema.safeParse({
    schemaVersion: 1,
    slug: instructor.slug,
    summary: result.value.summary,
    themes: result.value.themes,
    basedOnReviewCount: Math.max(reviews.length, instructor.reviewCount),
    latestReviewAt:
      [newest, instructor.latestReviewAt]
        .filter((t): t is string => t !== null)
        .map((t) => new Date(t).toISOString())
        .sort()
        .pop() ?? null,
    generatedAt: now.toISOString(),
    model: SUMMARY_MODEL,
  });
  if (!candidate.success) {
    track("summary_failed", { reason: "model-output" });
    return unavailable("failed");
  }
  try {
    await env.DATA.put(
      summaryKey(instructor.slug),
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
  const instructor = await findInstructor(env.DATA, input.slug, input.course);
  if (!instructor) return unavailable("unknown-instructor");
  if (instructor.reviewCount === 0) return unavailable("no-reviews");

  const cached = await readSummary(env.DATA, input.slug);
  if (cached && isFresh(cached, instructor)) {
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
        if (landed && isFresh(landed, instructor))
          return { status: "ok", summary: landed };
      }
      return unavailable("busy");
    }
    try {
      return await generate(env, instructor, deps);
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
