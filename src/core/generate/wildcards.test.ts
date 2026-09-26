import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aCourse,
  aGenerateRequest,
  aMeeting,
  aSection,
  fixtureTermId,
  mockCourses,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { countsForGenEd, matchesPattern } from "../catalog/wildcard";
import {
  type Course,
  type Day,
  DEFAULT_MUST_HAVES,
  type GenerateRequest,
  GenerateResultSchema,
  type GenItem,
  parseSectionKey,
  type Wildcard,
} from "../schema";
import { itemsOverlap, sectionWeekItems } from "../time/week";
import { EMPTY_CAMPUS } from "../travel/campus";
import type { CandidateOptions } from "./candidates";
import { applyRelaxation, type GenerateData, generatePlans } from "./generate";
import { ranksByQuality, rankWeights } from "./score";
import { creditSpan, wildcardOptions } from "./wildcards";

const data = (courses: Course[]): GenerateData => ({
  index: buildCatalogIndex(fixtureTermId, courses),
  seats: null,
  campus: EMPTY_CAMPUS,
  quality: new Map(),
});

const request = (items: GenItem[], overrides: Partial<GenerateRequest> = {}) =>
  aGenerateRequest({ items, blocks: [], ...overrides });

const required = (courseCode: string) =>
  ({ kind: "course", courseCode, required: true }) as const;
const pattern = (p: string): Wildcard => ({ kind: "pattern", pattern: p });
const any = (
  wildcard: Wildcard,
  { required = true, count = 1 }: { required?: boolean; count?: number } = {},
): GenItem => ({ kind: "wildcard", wildcard, required, count });

/** A course with one section per [code, days, start] (50-minute meetings). */
function course(
  code: string,
  sections: [string, Day[], number][],
  credits = 3,
): Course {
  return aCourse({
    code,
    credits: { min: credits, max: credits },
    sections: sections.map(([s, days, start]) =>
      aSection({
        code: s,
        instructors: [`Prof ${s}`],
        meetings: [aMeeting({ days, start, end: start + 50 })],
      }),
    ),
  });
}

const courseOf = (key: string) => parseSectionKey(key)?.courseCode ?? "";

// CMSC351 meets MWF 10am. The 400-levels: 412 clashes with it; 420 and
// 430 don't; 498A (a suffix) has two sections, one clashing.
const cmsc351 = course("CMSC351", [["0101", ["M", "W", "F"], 600]]);
const cmsc412 = course("CMSC412", [["0101", ["M", "W", "F"], 600]]);
const cmsc420 = course("CMSC420", [["0101", ["Tu", "Th"], 600]]);
const cmsc430 = course("CMSC430", [["0101", ["M", "W"], 780]]);
const cmsc498a = course("CMSC498A", [
  ["0101", ["M", "W", "F"], 600],
  ["0201", ["Tu", "Th"], 840],
]);
const math401 = course("MATH401", [["0101", ["Tu", "Th"], 720]]);
const term = [cmsc351, cmsc412, cmsc420, cmsc430, cmsc498a, math401];

describe("generating with a wildcard", () => {
  it("picks one course from the set per plan, and says which", () => {
    const result = generatePlans(
      request([required("CMSC351"), any(pattern("CMSC4XX"))]),
      data(term),
    );
    expect(GenerateResultSchema.safeParse(result).success).toBe(true);
    // 412 always clashes; 420, 430 and 498A's second section fit.
    expect(result.totalFound).toBe(3);
    for (const r of result.results) {
      expect(r.sections.map(courseOf)[0]).toBe("CMSC351");
      expect(r.filled).toHaveLength(1);
      const filled = r.filled[0];
      expect(filled?.wildcard).toBe("CMSC4XX");
      expect(r.sections.map(courseOf)).toEqual(["CMSC351", filled?.courseCode]);
      expect(r.skipped).toEqual([]);
    }
    expect(result.results.map((r) => r.filled[0]?.courseCode).sort()).toEqual([
      "CMSC420",
      "CMSC430",
      "CMSC498A",
    ]);
    expect(result.wildcards).toEqual([
      // 412 overlaps the required CMSC351 in every section: pruned.
      { wildcard: "CMSC4XX", matched: 4, fit: 3, tried: 3 },
    ]);
  });

  it("lists a wildcard's course in the wildcard's place", () => {
    const result = generatePlans(
      request([any(pattern("CMSC4XX")), required("CMSC351")]),
      data(term),
    );
    for (const r of result.results)
      expect(r.sections.map(courseOf)[1]).toBe("CMSC351");
  });

  it("never picks a course listed on its own", () => {
    const result = generatePlans(
      request([
        required("CMSC351"),
        { kind: "course", courseCode: "CMSC420", required: false },
        any(pattern("CMSC4XX")),
      ]),
      data(term),
    );
    for (const r of result.results)
      expect(r.filled.map((f) => f.courseCode)).not.toContain("CMSC420");
    expect(result.wildcards[0]?.matched).toBe(3);
  });

  it("takes different courses for a wildcard asked for twice, each plan once", () => {
    const result = generatePlans(
      request([required("CMSC351"), any(pattern("CMSC4XX"), { count: 2 })]),
      data(term),
    );
    // Every pair of 420, 430 and 498A 0201 fits: three plans, not six.
    expect(result.totalFound).toBe(3);
    const ids = result.results.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of result.results) {
      const codes = r.filled.map((f) => f.courseCode);
      expect(codes).toHaveLength(2);
      expect(new Set(codes).size).toBe(2);
      expect([...codes].sort()).toEqual(codes);
    }
  });

  it("leaves an optional wildcard out when that ranks better, without calling it skipped", () => {
    const result = generatePlans(
      request([
        required("CMSC351"),
        any(pattern("CMSC4XX"), { required: false }),
      ]),
      data(term),
    );
    // Three with a 400-level, one without.
    expect(result.totalFound).toBe(4);
    const without = result.results.find((r) => r.filled.length === 0);
    expect(without?.sections).toEqual(["CMSC351-0101"]);
    expect(without?.skipped).toEqual([]);
  });

  it("keeps a wildcard's courses apart from other wildcards'", () => {
    const result = generatePlans(
      request([any(pattern("CMSC4XX")), any(pattern("CMSC42X"))]),
      data([cmsc420]),
    );
    // One course can't fill both.
    expect(result.totalFound).toBe(0);
  });

  it("says plainly when nothing matches, and offers to make it optional", () => {
    const req = request([required("CMSC351"), any(pattern("ARTTXXX"))]);
    const result = generatePlans(req, data(term));
    expect(result.results).toEqual([]);
    expect(result.wildcards).toEqual([
      { wildcard: "ARTTXXX", matched: 0, fit: 0, tried: 0 },
    ]);
    const relax = result.relaxations.find(
      (r) => r.patch.makeWildcardOptional === "ARTTXXX",
    );
    expect(relax).toMatchObject({
      label: "Make any ARTT course optional",
      unlockCount: 1,
    });
    const relaxed = applyRelaxation(req, relax?.patch ?? {});
    expect(relaxed.items[1]).toMatchObject({ required: false });
  });

  it("counts each course's own credits against the credit range", () => {
    const one = course("CMSC401", [["0101", ["Tu"], 900]], 1);
    const four = course("CMSC402", [["0101", ["Th"], 900]], 4);
    const result = generatePlans(
      request([required("CMSC351"), any(pattern("CMSC40X"))], {
        mustHaves: { ...DEFAULT_MUST_HAVES, credits: { min: null, max: 5 } },
      }),
      data([cmsc351, one, four]),
    );
    expect(result.results.map((r) => r.filled[0]?.courseCode)).toEqual([
      "CMSC401",
    ]);
  });

  it("fills a gen-ed from across the catalog, never with a conditional code", () => {
    const courses = mockCourses();
    const result = generatePlans(
      request([required("CMSC351"), any({ kind: "gen-ed", code: "DSNL" })], {
        mustHaves: { ...DEFAULT_MUST_HAVES, enoughTravelTime: false },
      }),
      data(courses),
    );
    const index = buildCatalogIndex(fixtureTermId, courses);
    expect(result.results.length).toBeGreaterThan(0);
    for (const r of result.results) {
      const code = r.filled[0]?.courseCode ?? "";
      const picked = index.courses.get(code);
      expect(picked && countsForGenEd(picked, "DSNL")).toBe(true);
      // GEOL100 is DSNL only "if taken with GEOL110".
      expect(code).not.toBe("GEOL100");
    }
  });

  it("finds near-misses without naming the wildcard as a left-out course", () => {
    const result = generatePlans(
      request([required("CMSC351"), any(pattern("CMSC4XX"))], {
        mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 900 },
      }),
      data(term),
    );
    expect(result.results).toEqual([]);
    expect(GenerateResultSchema.safeParse(result).success).toBe(true);
    expect(result.nearMisses.length).toBeGreaterThan(0);
    for (const miss of result.nearMisses) {
      expect(miss.skipped).not.toContain("CMSC4XX");
      const courses = miss.sections.map(courseOf);
      expect(new Set(courses).size).toBe(courses.length);
    }
  });

  it("finds only valid, distinct plans (property)", () => {
    const days: Day[][] = [["M", "W", "F"], ["Tu", "Th"], ["M", "W"], ["F"]];
    const section = fc.tuple(
      fc.constantFrom(...days),
      fc.integer({ min: 16, max: 34 }).map((h) => h * 30),
    );
    const arb = fc.record({
      sections: fc.array(fc.array(section, { minLength: 1, maxLength: 3 }), {
        minLength: 2,
        maxLength: 6,
      }),
      count: fc.integer({ min: 1, max: 3 }),
      requiredCount: fc.integer({ min: 0, max: 1 }),
    });
    fc.assert(
      fc.property(arb, ({ sections, count, requiredCount }) => {
        const courses = sections.map((ss, i) =>
          course(
            `CMSC4${String(i).padStart(2, "0")}`,
            ss.map(([d, start], k) => [`0${k + 1}01`, d, start]),
          ),
        );
        const listed = courses.slice(0, requiredCount).map((c) => c.code);
        const result = generatePlans(
          request([
            ...listed.map(required),
            any(pattern("CMSC4XX"), { count }),
          ]),
          data(courses),
        );
        const index = buildCatalogIndex(fixtureTermId, courses);
        const ids = result.results.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const r of result.results) {
          const filled = r.filled.map((f) => f.courseCode);
          expect(filled).toHaveLength(count);
          expect(new Set([...filled, ...listed]).size).toBe(
            count + listed.length,
          );
          for (const code of filled)
            expect(matchesPattern("CMSC4XX", code)).toBe(true);
          const items = r.sections.flatMap((key) => {
            const ref = index.sections.get(key);
            return ref ? sectionWeekItems(ref.course.code, ref.section) : [];
          });
          for (let a = 0; a < items.length; a++)
            for (let b = a + 1; b < items.length; b++)
              expect(
                itemsOverlap(
                  items[a] as (typeof items)[number],
                  items[b] as (typeof items)[number],
                ),
              ).toBe(false);
        }
      }),
      { numRuns: 60 },
    );
  });
});

describe("ranksByQuality", () => {
  it("is on when ratings or GPAs weigh more than a tie-breaker", () => {
    expect(ranksByQuality({ preset: "best-rated" })).toBe(true);
    expect(ranksByQuality({ preset: "higher-gpa" })).toBe(true);
    expect(ranksByQuality({ preset: "compact" })).toBe(false);
    const weights = {
      compact: 1,
      "fewer-days": 0,
      "later-starts": 0,
      "best-rated": 0,
      "higher-gpa": 0,
      "safest-seats": 0,
    };
    expect(ranksByQuality({ preset: "custom", weights })).toBe(false);
    expect(
      ranksByQuality({
        preset: "custom",
        weights: { ...weights, "higher-gpa": 0.2 },
      }),
    ).toBe(true);
  });
});

describe("wildcardOptions", () => {
  const candidate: Omit<CandidateOptions, "only"> = {
    mustHaves: DEFAULT_MUST_HAVES,
    blocks: [],
    seats: null,
    quality: new Map(),
    keepViolations: false,
  };
  const weights = rankWeights({ preset: "later-starts" });

  it("caps a course at a time, so the cap keeps as many courses as it can", () => {
    const courses = ["CMSC401", "CMSC402", "CMSC403"].map((code, i) =>
      course(code, [
        ["0101", ["M"], 480 + i * 60],
        ["0201", ["Tu"], 540 + i * 60],
        ["0301", ["W"], 600 + i * 60],
      ]),
    );
    const { groups, report } = wildcardOptions({
      item: {
        kind: "wildcard",
        wildcard: pattern("CMSC4XX"),
        required: true,
        count: 1,
      },
      courses,
      listed: new Set(),
      candidate,
      required: [],
      weights,
      cap: 4,
    });
    expect(groups.map((g) => g.course.code)).toEqual([
      // Later starts rank CMSC403 first, then each course's latest section.
      "CMSC403",
      "CMSC402",
      "CMSC401",
      "CMSC403",
    ]);
    expect(groups[0]?.sections[0]?.code).toBe("0301");
    expect(report).toEqual({
      wildcard: "CMSC4XX",
      matched: 3,
      fit: 3,
      tried: 3,
    });
  });

  it("reports the courses the cap left out", () => {
    const courses = Array.from({ length: 5 }, (_, i) =>
      course(`CMSC4${i}0`, [["0101", ["M"], 480 + i * 60]]),
    );
    const { report } = wildcardOptions({
      item: {
        kind: "wildcard",
        wildcard: pattern("CMSC4XX"),
        required: true,
        count: 1,
      },
      courses,
      listed: new Set(),
      candidate,
      required: [],
      weights,
      cap: 2,
    });
    expect(report).toMatchObject({ matched: 5, fit: 5, tried: 2 });
  });

  it("spans its courses' credits", () => {
    expect(creditSpan([])).toBeNull();
    const groups = wildcardOptions({
      item: {
        kind: "wildcard",
        wildcard: pattern("CMSC4XX"),
        required: true,
        count: 1,
      },
      courses: [
        course("CMSC401", [["0101", ["M"], 480]], 1),
        course("CMSC402", [["0101", ["M"], 600]], 4),
      ],
      listed: new Set(),
      candidate,
      required: [],
      weights,
    }).groups;
    expect(creditSpan(groups)).toEqual({ min: 1, max: 4 });
  });
});
