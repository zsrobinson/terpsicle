import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  type Instructor,
  JOBS_PREFIX,
  PLANETTERP_MANIFEST_KEY,
  planetTerpDeptKey,
  ReviewSummarySchema,
  summaryKey,
} from "~/core/schema";
import { anInstructor, aPlanetTerpDept, aReviewSummary } from "~/fixtures";
import { type ApiEnv, handleApi } from "../api/router";
import { api } from "../fns/api";
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

function mockAi(...responses: unknown[]) {
  const run = vi.fn(async () => ({ response: responses.shift() ?? GOOD }));
  return { run, ai: { run } as unknown as Ai };
}

function testEnv(ai: Ai, cap?: string): SummaryEnv {
  return { ...env, AI: ai, ...(cap ? { SUMMARIES_DAILY_CAP: cap } : {}) };
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
    const ai = { run } as unknown as Ai;
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
