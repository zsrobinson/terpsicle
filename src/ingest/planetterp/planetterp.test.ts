import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planetTerpReviewsKey, StoredReviewsSchema } from "~/core/schema";
import { createMemoryBlobStore } from "../blob-store";
import { createHttpClient } from "../http";
import { silentLogger } from "../publish";
import {
  buildCourseGrades,
  fetchGrades,
  mergeCourseGrades,
  summarizeGrades,
} from "./planetterp";
import {
  createReviewKeeper,
  normalizeReviews,
  type ReviewApi,
} from "./reviews";
import {
  implausibleReason,
  statusAfterFailure,
  statusAfterSuccess,
} from "./source";

const read = (path: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../__fixtures__/planetterp/${path}`, import.meta.url),
      "utf8",
    ),
  );

describe("PlanetTerp grades", () => {
  const rows = read("grades-CMSC351.json");
  const byProfessor = summarizeGrades(rows);

  it("sums each professor's sections and semesters, keeping +/−, W and Other", () => {
    const kruskal = byProfessor["Clyde Kruskal"];
    const expected = Array.from({ length: 15 }, () => 0);
    const keys = [
      "A+",
      "A",
      "A-",
      "B+",
      "B",
      "B-",
      "C+",
      "C",
      "C-",
      "D+",
      "D",
      "D-",
      "F",
      "W",
      "Other",
    ];
    for (const row of rows.filter(
      (r: { professor: string }) => r.professor === "Clyde Kruskal",
    )) {
      keys.forEach((k, i) => {
        expected[i] = (expected[i] ?? 0) + row[k];
      });
    }
    expect(kruskal?.counts).toEqual(expected);
    expect(kruskal?.semesters).toContain("202501");
  });

  it("builds the course record: all instructors, plus each joined slug", () => {
    const record = buildCourseGrades(byProfessor, "CMSC351", (name) =>
      name === "Clyde Kruskal" ? "kruskal" : null,
    );
    expect(record?.all?.latestTermId).toBe("202501");
    expect(record?.all?.semesters).toBe(27);
    expect(Object.keys(record?.byInstructor ?? {})).toEqual(["kruskal"]);
    const total = (record?.all?.counts ?? []).reduce((a, b) => a + b, 0);
    const rowsTotal = rows.reduce(
      (n: number, r: Record<string, number>) =>
        n +
        [
          "A+",
          "A",
          "A-",
          "B+",
          "B",
          "B-",
          "C+",
          "C",
          "C-",
          "D+",
          "D",
          "D-",
          "F",
          "W",
          "Other",
        ].reduce((m, k) => m + (r[k] ?? 0), 0),
      0,
    );
    expect(total).toBe(rowsTotal);
  });

  it("returns null when PlanetTerp has no grades", () => {
    expect(buildCourseGrades({}, "CMSC999", () => null)).toBeNull();
  });
});

describe("fetching grades", () => {
  /** An HTTP client whose every answer is this saved page. */
  const answering = (name: string, status: number) =>
    createHttpClient({
      fetch: async () =>
        new Response(
          readFileSync(
            new URL(`../__fixtures__/planetterp/${name}`, import.meta.url),
          ),
          { status },
        ),
      sleep: async () => {},
    });

  it("parses rows, and reads PlanetTerp's 400 'course not found' as no grades", async () => {
    expect(
      await fetchGrades(answering("grades-CMSC351.json", 200), "CMSC351"),
    ).toHaveLength(84);
    expect(
      await fetchGrades(
        answering("grades-course-not-found.json", 400),
        "CMSC999",
      ),
    ).toBeNull();
  });

  it("throws on any other 400, so the stored grades stay", async () => {
    await expect(
      fetchGrades(answering("grades-no-params.json", 400), "CMSC351"),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never lets an empty answer replace stored rows", () => {
    const now = new Date("2026-09-27T05:17:00Z");
    const stored = {
      fetchedAt: "2026-09-20T05:17:00.000Z",
      byProfessor: summarizeGrades(rows()),
    };
    const kept = mergeCourseGrades(stored, {}, now);
    expect(kept.kept).toBe(true);
    expect(kept.state.byProfessor).toBe(stored.byProfessor);
    // It still moves to the back of the rotation.
    expect(kept.state.fetchedAt).toBe(now.toISOString());

    expect(mergeCourseGrades(undefined, {}, now)).toEqual({
      state: { fetchedAt: now.toISOString(), byProfessor: {} },
      kept: false,
    });
    const fresh = summarizeGrades(rows().slice(0, 3));
    expect(mergeCourseGrades(stored, fresh, now).state.byProfessor).toBe(fresh);
  });

  function rows() {
    return read("grades-CMSC351.json");
  }
});

describe("PlanetTerp sanity floors", () => {
  const last = { professors: 14_496, reviews: 47_914 };

  it("rejects an empty list, and lists more than 10% short of the last good run", () => {
    expect(implausibleReason({ professors: 0, reviews: 0 }, null)).toBe(
      "PlanetTerp listed no professors",
    );
    expect(implausibleReason({ professors: 11, reviews: 171 }, null)).toBe(
      null,
    );
    expect(
      implausibleReason({ professors: 13_000, reviews: 47_914 }, last),
    ).toMatch(/13000 professors, down from 14496/);
    // `reviews` dropped from list items: every count reads 0.
    expect(implausibleReason({ professors: 14_496, reviews: 0 }, last)).toMatch(
      /0 reviews, down from 47914/,
    );
    expect(
      implausibleReason({ professors: 14_000, reviews: 47_000 }, last),
    ).toBeNull();
  });

  it("marks PlanetTerp stale when reviews stop, and gone after weeks of failures", () => {
    const now = new Date("2026-09-26T05:17:00Z");
    expect(statusAfterSuccess("2026-09-20T00:00:00.000Z", now)).toEqual({
      status: "ok",
      reason: null,
    });
    expect(statusAfterSuccess("2026-04-29T00:00:00.000Z", now)).toEqual({
      status: "stale",
      reason: "No new PlanetTerp review since 2026-04-29",
    });
    expect(statusAfterFailure("2026-09-25T05:17:00.000Z", now)).toBe("stale");
    expect(statusAfterFailure("2026-08-20T05:17:00.000Z", now)).toBe("gone");
    expect(statusAfterFailure(null, now)).toBe("stale");
  });
});

describe("stored review text", () => {
  const kruskal = read("professor-kruskal-reviews.json");

  it("normalizes PlanetTerp's reviews, oldest first", () => {
    const reviews = normalizeReviews(kruskal.reviews);
    expect(reviews).toHaveLength(111);
    expect(reviews[0]?.created).toMatch(/^20\d\d-\d\d-\d\dT.*Z$/);
    expect(
      reviews.every((r, i) => r.created >= (reviews[i - 1]?.created ?? "")),
    ).toBe(true);
    expect(reviews.find((r) => r.expectedGrade === "A")).toBeDefined();
  });

  it("writes changed files only, and never replaces reviews with fewer", async () => {
    const store = createMemoryBlobStore();
    const keep = async (reviews: ReviewApi[]) => {
      const keeper = await createReviewKeeper(store, silentLogger);
      await keeper.keep([{ slug: "kruskal", name: "Clyde Kruskal", reviews }]);
      return keeper.finish();
    };
    const key = planetTerpReviewsKey("kruskal");

    expect(await keep(kruskal.reviews)).toEqual({ written: 1, kept: 0 });
    const stored = StoredReviewsSchema.parse(
      JSON.parse(new TextDecoder().decode((await store.get(key)) ?? undefined)),
    );
    expect(stored.reviews).toHaveLength(111);

    // Unchanged: no write. Empty or shortened: the stored copy stays.
    expect(await keep(kruskal.reviews)).toEqual({ written: 0, kept: 0 });
    expect(await keep([])).toEqual({ written: 0, kept: 1 });
    expect(await keep(kruskal.reviews.slice(0, 50))).toEqual({
      written: 0,
      kept: 1,
    });
    expect(store.writes.filter((k) => k === key)).toHaveLength(1);

    // A new review is written.
    const newer = {
      ...kruskal.reviews[0],
      review: "A new one.",
      created: "2026-09-01T00:00:00Z",
    };
    expect(await keep([...kruskal.reviews, newer])).toEqual({
      written: 1,
      kept: 0,
    });
  });
});
