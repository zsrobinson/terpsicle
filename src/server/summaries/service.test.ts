import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  type Instructor,
  JOBS_PREFIX,
  PLANETTERP_MANIFEST_KEY,
  planetTerpDeptKey,
  planetTerpReviewsKey,
  ReviewSummarySchema,
  summaryKey,
} from "~/core/schema";
import {
  anInstructor,
  aPlanetTerpDept,
  aReviewSummary,
  someStoredReviews,
} from "~/fixtures";
import { type ApiEnv, handleApi } from "../api/router";
import { api } from "../fns/api";
import { GUARD_MODEL } from "../moderation/models";
import { getReviewSummary, isFresh, type SummaryEnv } from "./service";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const GOOD = {
  summary:
    "Students say lectures are clear and well paced. Exams are hard but fair, and most found the workload manageable.",
  themes: [
    { label: "clear lectures", sentiment: "positive" },
    { label: "hard exams", sentiment: "negative" },
  ],
};

let deptHash = 0;
/** Publishes a PlanetTerp manifest whose TEST department holds these instructors. */
async function publishInstructors(...instructors: Instructor[]) {
  const hash = (++deptHash).toString(16).padStart(16, "0");
  const dept = aPlanetTerpDept({
    dept: "TEST",
    instructors: Object.fromEntries(instructors.map((i) => [i.slug, i])),
    names: {},
    courses: {},
  });
  await env.DATA.put(planetTerpDeptKey("TEST", hash), JSON.stringify(dept));
  await env.DATA.put(
    PLANETTERP_MANIFEST_KEY,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: NOW.toISOString(),
      gradesThrough: "202501",
      departments: [{ code: "TEST", hash }],
    }),
  );
}

function planetTerp(slug: string, name: string, count = 3) {
  const reviews = Array.from({ length: count }, (_, i) => ({
    professor: name,
    course: "TEST101",
    review: `Review ${i}: lectures are clear, exams are hard.`,
    rating: 4,
    expected_grade: "A-",
    created: `2026-0${(i % 4) + 1}-15T12:00:00Z`,
  }));
  return vi.fn(async () =>
    Response.json({ name, slug, type: "professor", reviews }),
  );
}

/**
 * An AI binding: Llama Guard answers `guard` (safe unless told otherwise),
 * and `run`, the summary model's calls, answers the rest.
 */
function withGuard(
  run: (model: string, input: unknown) => Promise<unknown>,
  guard: unknown = { safe: true },
) {
  const checks = vi.fn(async (_model: string, _input: unknown) => ({
    response: guard,
  }));
  const ai = {
    run: (model: string, input: unknown) =>
      model === GUARD_MODEL ? checks(model, input) : run(model, input),
  } as unknown as Ai;
  return { ai, checks };
}

function mockAi(...responses: unknown[]) {
  const run = vi.fn(async (_model: string, _input: unknown) => ({
    response: responses.shift() ?? GOOD,
  }));
  return { run, ...withGuard(run) };
}

function testEnv(
  ai: Ai,
  cap?: string,
  reviews: "off" | "read" | "on" = "off",
): SummaryEnv {
  return {
    ...env,
    AI: ai,
    REVIEWS_ENABLED: reviews,
    ...(cap ? { SUMMARIES_DAILY_CAP: cap } : {}),
  };
}

let reviewNumber = 0;
/** A review of ours in D1 (V2 §7.3), published unless `status` says otherwise. */
async function addReview(
  instructorId: string,
  fields: { body?: string; status?: string; publishedAt?: string } = {},
) {
  const id = `sum-review-${String(++reviewNumber).padStart(11, "0")}`;
  const at = fields.publishedAt ?? "2026-09-20T18:30:00.000Z";
  await env.DB.prepare(
    `INSERT INTO reviews (id, author_id, instructor_id, reviewed_name, course, term_id,
       rating, grade, body, text_hash, status, created_at, published_at, updated_at)
     VALUES (?1, NULL, ?2, 'Some Name', 'TEST101', NULL, 5, NULL, ?3, ?4, ?5, ?6, ?6, ?6)`,
  )
    .bind(
      id,
      instructorId,
      fields.body ??
        `Terpsicle review ${reviewNumber}: office hours help a lot.`,
      "0".repeat(64),
      fields.status ?? "published",
      at,
    )
    .run();
  return id;
}

async function addInstructor(id: string, name: string, slug: string | null) {
  await env.DB.prepare(
    "INSERT INTO instructors (id, name, planetterp_slug, created_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(id, name, slug, "2026-09-01T00:00:00.000Z")
    .run();
}

describe("review summaries", () => {
  it("generates on the first request, stores it, then serves the cache", async () => {
    const instructor = anInstructor({
      slug: "gen_one",
      name: "Gen One",
      reviewCount: 3,
    });
    await publishInstructors(instructor);
    const { ai, run } = mockAi();
    const fetcher = planetTerp("gen_one", "Gen One");
    const input = { slug: "gen_one", course: "TEST101" };

    const first = await getReviewSummary(testEnv(ai), input, {
      now: NOW,
      fetcher,
    });
    if (first.status !== "ok") throw new Error(first.reason);
    expect(first.summary).toMatchObject({
      slug: "gen_one",
      basedOnReviewCount: 3,
      summary: GOOD.summary,
    });
    expect(first.summary.model).toMatch(/^@cf\//);
    const stored = await env.DATA.get(summaryKey("gen_one"));
    expect(ReviewSummarySchema.parse(await stored?.json())).toEqual(
      first.summary,
    );

    const second = await getReviewSummary(testEnv(ai), input, {
      now: NOW,
      fetcher,
    });
    expect(second).toEqual(first);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // The lock is released.
    expect(
      await env.DATA.get(`${JOBS_PREFIX}summary-locks/gen_one.json`),
    ).toBeNull();
  });

  it("regenerates when new reviews arrive", async () => {
    const old = aReviewSummary({
      slug: "stale_one",
      basedOnReviewCount: 2,
      latestReviewAt: "2026-01-15T12:00:00.000Z",
    });
    await env.DATA.put(summaryKey("stale_one"), JSON.stringify(old));
    await publishInstructors(
      anInstructor({
        slug: "stale_one",
        name: "Stale One",
        reviewCount: 4,
        latestReviewAt: "2026-04-15T12:00:00.000Z",
      }),
    );
    const { ai, run } = mockAi();
    const result = await getReviewSummary(
      testEnv(ai),
      { slug: "stale_one", course: "TEST200" },
      {
        now: NOW,
        fetcher: planetTerp("stale_one", "Stale One", 4),
      },
    );
    expect(result.status === "ok" && result.summary.basedOnReviewCount).toBe(4);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("judges freshness by count and newest review", () => {
    const instructor = anInstructor({
      reviewCount: 10,
      latestReviewAt: "2026-04-01T00:00:00.000Z",
    });
    expect(
      isFresh(
        aReviewSummary({
          basedOnReviewCount: 10,
          latestReviewAt: "2026-04-01T00:00:00.000Z",
        }),
        instructor,
      ),
    ).toBe(true);
    expect(
      isFresh(
        aReviewSummary({
          basedOnReviewCount: 9,
          latestReviewAt: "2026-04-01T00:00:00.000Z",
        }),
        instructor,
      ),
    ).toBe(false);
    expect(
      isFresh(
        aReviewSummary({
          basedOnReviewCount: 10,
          latestReviewAt: "2026-03-01T00:00:00.000Z",
        }),
        instructor,
      ),
    ).toBe(false);
  });

  it("retries once on invalid output, and never stores output that fails twice", async () => {
    await publishInstructors(
      anInstructor({ slug: "retry_ok", name: "Retry Ok", reviewCount: 3 }),
      anInstructor({ slug: "retry_bad", name: "Retry Bad", reviewCount: 3 }),
    );
    const injected = {
      summary:
        "Great! Visit https://evil.example now for answers to every exam.",
      themes: GOOD.themes,
    };
    const once = mockAi("not json at all", GOOD);
    const ok = await getReviewSummary(
      testEnv(once.ai),
      { slug: "retry_ok", course: "TEST101" },
      {
        now: NOW,
        fetcher: planetTerp("retry_ok", "Retry Ok"),
      },
    );
    expect(ok.status).toBe("ok");
    expect(once.run).toHaveBeenCalledTimes(2);
    const retryMessages = once.run.mock.calls[1] as unknown as [
      string,
      { messages: { content: string }[] },
    ];
    expect(retryMessages[1].messages[1]?.content).toContain(
      "previous answer was rejected",
    );

    const twice = mockAi(injected, { summary: "short", themes: [] });
    const bad = await getReviewSummary(
      testEnv(twice.ai),
      { slug: "retry_bad", course: "TEST101" },
      {
        now: NOW,
        fetcher: planetTerp("retry_bad", "Retry Bad"),
      },
    );
    expect(bad).toEqual({ status: "unavailable", reason: "failed" });
    expect(await env.DATA.get(summaryKey("retry_bad"))).toBeNull();
  });

  it("fails closed when PlanetTerp returns a different person with the same name", async () => {
    await publishInstructors(
      anInstructor({
        slug: "hamilton",
        name: "Douglas Hamilton",
        reviewCount: 5,
      }),
    );
    const { ai, run } = mockAi();
    const result = await getReviewSummary(
      testEnv(ai),
      { slug: "hamilton", course: "TEST101" },
      {
        now: NOW,
        fetcher: planetTerp("hamilton_douglas", "Douglas Hamilton"),
      },
    );
    expect(result).toEqual({ status: "unavailable", reason: "failed" });
    expect(run).not.toHaveBeenCalled();
  });

  it("summarizes the stored reviews without asking PlanetTerp", async () => {
    await publishInstructors(
      anInstructor({ slug: "kept_one", name: "Kept One", reviewCount: 3 }),
    );
    await env.DATA.put(
      planetTerpReviewsKey("kept_one"),
      JSON.stringify(
        someStoredReviews(3, { slug: "kept_one", name: "Kept One" }),
      ),
    );
    const { ai, run } = mockAi();
    const fetcher = vi.fn(async () => new Response("down", { status: 503 }));
    const result = await getReviewSummary(
      testEnv(ai),
      { slug: "kept_one", course: "TEST101" },
      { now: NOW, fetcher },
    );
    expect(result.status === "ok" && result.summary.basedOnReviewCount).toBe(3);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(run.mock.calls[0])).toContain("Stored review 3");
  });

  it("asks PlanetTerp when the stored copy is behind, and falls back to it when PlanetTerp is down", async () => {
    await publishInstructors(
      anInstructor({ slug: "behind_one", name: "Behind One", reviewCount: 4 }),
      anInstructor({ slug: "gone_one", name: "Gone One", reviewCount: 4 }),
    );
    for (const [slug, name] of [
      ["behind_one", "Behind One"],
      ["gone_one", "Gone One"],
    ] as const) {
      await env.DATA.put(
        planetTerpReviewsKey(slug),
        JSON.stringify(someStoredReviews(2, { slug, name })),
      );
    }

    const live = mockAi();
    const fetcher = planetTerp("behind_one", "Behind One", 4);
    const fresh = await getReviewSummary(
      testEnv(live.ai),
      { slug: "behind_one", course: "TEST101" },
      { now: NOW, fetcher },
    );
    expect(fresh.status).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(live.run.mock.calls[0])).toContain("Review 3:");

    const stored = mockAi();
    const down = vi.fn(async () => new Response("down", { status: 503 }));
    const kept = await getReviewSummary(
      testEnv(stored.ai),
      { slug: "gone_one", course: "TEST101" },
      { now: NOW, fetcher: down },
    );
    expect(kept.status).toBe("ok");
    expect(JSON.stringify(stored.run.mock.calls[0])).toContain(
      "Stored review 2",
    );
  });

  it("answers unknown instructors and ones with no reviews without calling anything", async () => {
    await publishInstructors(
      anInstructor({
        slug: "quiet",
        reviewCount: 0,
        rating: null,
        latestReviewAt: null,
      }),
    );
    const { ai, run } = mockAi();
    const fetcher = planetTerp("quiet", "Quiet");
    const deps = { now: NOW, fetcher };
    expect(
      await getReviewSummary(
        testEnv(ai),
        { slug: "quiet", course: "TEST101" },
        deps,
      ),
    ).toEqual({
      status: "unavailable",
      reason: "no-reviews",
    });
    expect(
      await getReviewSummary(
        testEnv(ai),
        { slug: "nobody", course: "TEST101" },
        deps,
      ),
    ).toEqual({
      status: "unavailable",
      reason: "unknown-instructor",
    });
    expect(
      await getReviewSummary(
        testEnv(ai),
        { slug: "quiet", course: "NONE101" },
        deps,
      ),
    ).toEqual({
      status: "unavailable",
      reason: "unknown-instructor",
    });
    expect(run).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("coalesces concurrent first requests into one generation", async () => {
    await publishInstructors(
      anInstructor({ slug: "popular", name: "Popular Prof", reviewCount: 3 }),
    );
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = vi.fn(async () => {
      await gate;
      return { response: GOOD };
    });
    const { ai } = withGuard(run);
    const deps = { now: NOW, fetcher: planetTerp("popular", "Popular Prof") };
    const input = { slug: "popular", course: "TEST101" };
    const all = Promise.all(
      [1, 2, 3].map(() => getReviewSummary(testEnv(ai), input, deps)),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const results = await all;
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("waits for another isolate's generation, then reports busy", async () => {
    await publishInstructors(
      anInstructor({ slug: "locked", name: "Locked Prof", reviewCount: 3 }),
    );
    await env.DATA.put(
      `${JOBS_PREFIX}summary-locks/locked.json`,
      JSON.stringify({
        expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
      }),
    );
    const { ai, run } = mockAi();
    const result = await getReviewSummary(
      testEnv(ai),
      { slug: "locked", course: "TEST101" },
      {
        now: NOW,
        fetcher: planetTerp("locked", "Locked Prof"),
        waitForOthersMs: 30,
        pollMs: 10,
      },
    );
    expect(result).toEqual({ status: "unavailable", reason: "busy" });
    expect(run).not.toHaveBeenCalled();

    // A lock past its TTL (a crashed generation) is taken over.
    const later = new Date(NOW.getTime() + 61_000);
    const taken = await getReviewSummary(
      testEnv(ai),
      { slug: "locked", course: "TEST101" },
      {
        now: later,
        fetcher: planetTerp("locked", "Locked Prof"),
      },
    );
    expect(taken.status).toBe("ok");
  });

  it("stops at the daily cap", async () => {
    await publishInstructors(
      anInstructor({ slug: "cap_a", name: "Cap A", reviewCount: 3 }),
      anInstructor({ slug: "cap_b", name: "Cap B", reviewCount: 3 }),
    );
    const day = new Date("2026-11-05T12:00:00.000Z");
    await env.DB.prepare(
      "INSERT INTO counters (name, window_start, count) VALUES ('summaries', ?1, 4)",
    )
      .bind("2026-11-05T00:00:00.000Z")
      .run();
    const { ai } = mockAi();
    const a = await getReviewSummary(
      testEnv(ai, "5"),
      { slug: "cap_a", course: "TEST101" },
      {
        now: day,
        fetcher: planetTerp("cap_a", "Cap A"),
      },
    );
    const b = await getReviewSummary(
      testEnv(ai, "5"),
      { slug: "cap_b", course: "TEST101" },
      {
        now: day,
        fetcher: planetTerp("cap_b", "Cap B"),
      },
    );
    expect(a.status).toBe("ok");
    expect(b).toEqual({ status: "unavailable", reason: "daily-limit" });
  });

  it("summarizes our published reviews with PlanetTerp's, and says how many of each", async () => {
    await publishInstructors(
      anInstructor({
        slug: "mixed_one",
        name: "Mixed One",
        reviewCount: 3,
        latestReviewAt: "2026-04-15T12:00:00.000Z",
      }),
    );
    await addInstructor("mixed_one", "Mixed One", "mixed_one");
    await addReview("mixed_one", { body: "OURS-A clear and kind." });
    await addReview("mixed_one", { body: "OURS-B fair exams." });
    await addReview("mixed_one", { body: "OURS-C held.", status: "held" });
    const { ai, run, checks } = mockAi();
    const result = await getReviewSummary(
      testEnv(ai, undefined, "read"),
      { slug: "mixed_one", course: "TEST101" },
      { now: NOW, fetcher: planetTerp("mixed_one", "Mixed One") },
    );
    if (result.status !== "ok") throw new Error(result.reason);
    expect(result.summary).toMatchObject({
      basedOnReviewCount: 5,
      sources: { planetterp: 3, terpsicle: 2 },
      // Ours count by month only (V2 §7.5): September, not the 20th at 18:30.
      latestReviewAt: "2026-09-01T00:00:00.000Z",
    });
    const prompt = JSON.stringify(run.mock.calls[0]);
    expect(prompt).toContain("OURS-A");
    expect(prompt).toContain("Review 2:");
    expect(prompt).not.toContain("OURS-C");
    // The summary went through Llama Guard before it was stored.
    expect(JSON.stringify(checks.mock.calls[0])).toContain(GOOD.summary);
  });

  it("summarizes an instructor PlanetTerp doesn't know from our reviews alone", async () => {
    await addInstructor("t~summary234", "Pat Quill", null);
    await addReview("t~summary234");
    const { ai } = mockAi();
    const fetcher = planetTerp("quill", "Pat Quill");
    const result = await getReviewSummary(
      testEnv(ai, undefined, "on"),
      { slug: "t~summary234", course: "TEST101" },
      { now: NOW, fetcher },
    );
    expect(result.status === "ok" && result.summary.sources).toEqual({
      planetterp: 0,
      terpsicle: 1,
    });
    expect(fetcher).not.toHaveBeenCalled();

    // Known to us, but nothing published: no reviews, not unknown.
    await addInstructor("t~summary999", "Sam Held", null);
    await addReview("t~summary999", { status: "held" });
    expect(
      await getReviewSummary(
        testEnv(ai, undefined, "on"),
        { slug: "t~summary999", course: "TEST101" },
        { now: NOW, fetcher },
      ),
    ).toEqual({ status: "unavailable", reason: "no-reviews" });
  });

  it("goes stale when one of our reviews is taken down", async () => {
    await publishInstructors(
      anInstructor({
        slug: "taken_down",
        name: "Taken Down",
        reviewCount: 3,
        latestReviewAt: "2026-04-15T12:00:00.000Z",
      }),
    );
    await addInstructor("taken_down", "Taken Down", "taken_down");
    const id = await addReview("taken_down");
    await addReview("taken_down");
    const deps = { now: NOW, fetcher: planetTerp("taken_down", "Taken Down") };
    const input = { slug: "taken_down", course: "TEST101" };
    const { ai, run } = mockAi();
    await getReviewSummary(testEnv(ai, undefined, "read"), input, deps);
    await getReviewSummary(testEnv(ai, undefined, "read"), input, deps);
    expect(run).toHaveBeenCalledTimes(1);

    await env.DB.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?1")
      .bind(id)
      .run();
    const again = await getReviewSummary(
      testEnv(ai, undefined, "read"),
      input,
      deps,
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(again.status === "ok" && again.summary.sources).toEqual({
      planetterp: 3,
      terpsicle: 1,
    });
  });

  it("leaves our reviews out while Reviews is off", async () => {
    await publishInstructors(
      anInstructor({ slug: "off_one", name: "Off One", reviewCount: 3 }),
    );
    await addInstructor("off_one", "Off One", "off_one");
    await addReview("off_one", { body: "OURS-OFF should not be read." });
    const { ai, run } = mockAi();
    const result = await getReviewSummary(
      testEnv(ai),
      { slug: "off_one", course: "TEST101" },
      { now: NOW, fetcher: planetTerp("off_one", "Off One") },
    );
    expect(result.status === "ok" && result.summary.basedOnReviewCount).toBe(3);
    expect(JSON.stringify(run.mock.calls[0])).not.toContain("OURS-OFF");
  });

  it("never stores or shows a summary Llama Guard flags, or one it couldn't check", async () => {
    await publishInstructors(
      anInstructor({ slug: "flagged", name: "Flagged One", reviewCount: 3 }),
      anInstructor({
        slug: "unchecked",
        name: "Unchecked One",
        reviewCount: 3,
      }),
    );
    const run = vi.fn(async () => ({ response: GOOD }));
    const flagged = withGuard(run, { safe: false, categories: ["S5"] });
    expect(
      await getReviewSummary(
        testEnv(flagged.ai),
        { slug: "flagged", course: "TEST101" },
        { now: NOW, fetcher: planetTerp("flagged", "Flagged One") },
      ),
    ).toEqual({ status: "unavailable", reason: "failed" });
    expect(await env.DATA.get(summaryKey("flagged"))).toBeNull();

    const garbled = withGuard(run, "not a verdict");
    expect(
      await getReviewSummary(
        testEnv(garbled.ai),
        { slug: "unchecked", course: "TEST101" },
        { now: NOW, fetcher: planetTerp("unchecked", "Unchecked One") },
      ),
    ).toEqual({ status: "unavailable", reason: "failed" });
    expect(await env.DATA.get(summaryKey("unchecked"))).toBeNull();
  });

  it("is reachable through the typed client and the router", async () => {
    const cached = aReviewSummary({ slug: "via_api", basedOnReviewCount: 3 });
    await env.DATA.put(summaryKey("via_api"), JSON.stringify(cached));
    await publishInstructors(
      anInstructor({
        slug: "via_api",
        reviewCount: 3,
        latestReviewAt: cached.latestReviewAt,
      }),
    );
    const routed: ApiEnv = { ...env, AI: mockAi().ai };
    const fetcher: typeof fetch = async (input, init) =>
      handleApi(
        new Request(`https://terpsicle.com${String(input)}`, init),
        routed,
        {
          waitUntil: () => undefined,
        },
      );
    expect(
      await api.reviewSummary(
        { slug: "via_api", course: "TEST101" },
        { fetcher },
      ),
    ).toEqual({
      status: "ok",
      summary: cached,
    });
    await expect(
      api.reviewSummary({ slug: "via api!", course: "TEST101" }, { fetcher }),
    ).rejects.toMatchObject({
      reason: "invalid-input",
    });
  });
});
