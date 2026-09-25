import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aBlock,
  aCourse,
  aGenerateRequest,
  aMeeting,
  anUntimedMeeting,
  aSeatTuple,
  aSection,
  fixtureTermId,
  mockCourses,
  mockPlanetTerpDepts,
  mockSeats,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import {
  type Course,
  DAYS,
  type Day,
  DEFAULT_GENERATE_LIMITS,
  DEFAULT_MUST_HAVES,
  DEFAULT_TRAVEL_SETTINGS,
  type GenerateRequest,
  GenerateResultSchema,
  type MustHaves,
  parseSectionKey,
  type SeatTuple,
} from "../schema";
import { blockWeekItems, itemsOverlap, sectionWeekItems } from "../time/week";
import { campusMap, EMPTY_CAMPUS } from "../travel/campus";
import { planConnections } from "../travel/connections";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import { candidateGroups } from "./candidates";
import {
  applyRelaxation,
  type GenerateData,
  generatePlans,
  relaxationOptions,
} from "./generate";
import { sectionQuality } from "./quality";
import { planStats, scoreBreakdown, totalScore } from "./score";

const TERM = fixtureTermId;

const data = (
  courses: Course[],
  extra: Partial<GenerateData> = {},
): GenerateData => ({
  index: buildCatalogIndex(TERM, courses),
  seats: null,
  campus: EMPTY_CAMPUS,
  quality: new Map(),
  ...extra,
});

const request = (overrides: Partial<GenerateRequest> = {}): GenerateRequest =>
  aGenerateRequest({ blocks: [], ...overrides });

const required = (courseCode: string) =>
  ({ kind: "course", courseCode, required: true }) as const;
const optional = (courseCode: string) =>
  ({ kind: "course", courseCode, required: false }) as const;

/** A course with one section per [code, days, start] (50-minute meetings in IRB). */
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

// ---------- behavior ----------

describe("generatePlans", () => {
  const a = course("CMSC351", [
    ["0101", ["M", "W", "F"], 600],
    ["0201", ["M", "W", "F"], 660],
    ["0301", ["Tu", "Th"], 600],
  ]);
  const b = course("CMSC330", [
    ["0101", ["M", "W", "F"], 600],
    ["0102", ["M", "W", "F"], 600],
    ["0103", ["M", "W", "F"], 600],
    ["0201", ["Tu", "Th"], 780],
  ]);

  it("finds every conflict-free combination, merging time-identical sections", () => {
    const result = generatePlans(
      request({ items: [required("CMSC351"), required("CMSC330")] }),
      data([a, b]),
    );
    expect(GenerateResultSchema.safeParse(result).success).toBe(true);
    // 351 × 330-groups: (0101, 0101–0103) clash; the other five fit.
    expect(result.totalFound).toBe(5);
    expect(result.truncated).toBe(false);
    const merged = result.results.find((r) =>
      r.sections.includes("CMSC330-0101"),
    );
    expect(merged?.equivalents).toEqual({
      count: 3,
      byCourse: [
        { courseCode: "CMSC330", sectionCodes: ["0101", "0102", "0103"] },
      ],
    });
    for (const r of result.results) {
      expect(r.sections.map((k) => parseSectionKey(k)?.courseCode)).toEqual([
        "CMSC351",
        "CMSC330",
      ]);
      expect(r.id).toBe([...r.sections].sort().join(","));
    }
  });

  it("ranks by the chosen preset", () => {
    const fewer = generatePlans(
      request({
        items: [required("CMSC351"), required("CMSC330")],
        rankBy: { preset: "fewer-days" },
      }),
      data([a, b]),
    );
    // Both on TuTh: two days on campus.
    expect(fewer.results[0]?.stats.daysOnCampus).toBe(2);
    const later = generatePlans(
      request({
        items: [required("CMSC351"), required("CMSC330")],
        rankBy: { preset: "later-starts" },
      }),
      data([a, b]),
    );
    expect(later.results[0]?.sections).toContain("CMSC351-0201");
  });

  it("includes optional courses when they fit, and skips them otherwise", () => {
    const c = course("MUSC130", [["0101", ["M", "W", "F"], 600]]);
    const result = generatePlans(
      request({ items: [required("CMSC351"), optional("MUSC130")] }),
      data([a, c]),
    );
    const withMusic = result.results.filter((r) =>
      r.sections.includes("MUSC130-0101"),
    );
    const without = result.results.filter((r) => r.skipped.includes("MUSC130"));
    expect(withMusic).toHaveLength(2);
    expect(without).toHaveLength(3);
  });

  it("picks exactly N of a group", () => {
    const x = course("PHIL140", [["0101", ["Tu"], 900]]);
    const y = course("MUSC130", [["0101", ["W"], 900]]);
    const z = course("ARTH200", [["0101", ["Th"], 900]]);
    const result = generatePlans(
      request({
        items: [
          required("CMSC351"),
          {
            kind: "pick",
            id: "hum",
            count: 2,
            courses: [
              { courseCode: "PHIL140" },
              { courseCode: "MUSC130" },
              { courseCode: "ARTH200" },
            ],
          },
        ],
      }),
      data([a, x, y, z]),
    );
    expect(result.totalFound).toBe(3 * 3);
    for (const r of result.results) expect(r.sections).toHaveLength(3);
  });

  it("honors section restrictions and every must-have", () => {
    const blocks = [aBlock({ days: ["Tu"], start: 590, end: 620 })];
    const result = generatePlans(
      request({
        items: [
          {
            kind: "course",
            courseCode: "CMSC351",
            required: true,
            sections: ["0101", "0301"],
          },
        ],
        blocks,
      }),
      data([a]),
    );
    // 0301 meets TuTh at 10, inside the block.
    expect(result.results.map((r) => r.sections)).toEqual([["CMSC351-0101"]]);
    const noBlocks = generatePlans(
      request({
        items: [
          {
            kind: "course",
            courseCode: "CMSC351",
            required: true,
            sections: ["0101", "0301"],
          },
        ],
        blocks,
        mustHaves: { ...DEFAULT_MUST_HAVES, respectBlocks: false },
      }),
      data([a]),
    );
    expect(noBlocks.totalFound).toBe(2);
  });

  it("checks travel time only when asked, and credit ranges", () => {
    const near = aCourse({
      code: "CMSC330",
      sections: [
        aSection({
          meetings: [aMeeting({ start: 655, end: 705, building: "KEY" })],
        }),
      ],
    });
    const here = aCourse({
      code: "CMSC351",
      sections: [
        aSection({
          meetings: [aMeeting({ start: 600, end: 650, building: "IRB" })],
        }),
      ],
    });
    const campus = campusMap(
      decodeRoutes(
        encodeRoutes({ buildings: ["IRB", "KEY"], distance: () => 3000 }),
      ),
      null,
    );
    const items = [required("CMSC351"), required("CMSC330")];
    expect(
      generatePlans(request({ items }), data([here, near], { campus }))
        .totalFound,
    ).toBe(0);
    expect(
      generatePlans(
        request({
          items,
          mustHaves: { ...DEFAULT_MUST_HAVES, enoughTravelTime: false },
        }),
        data([here, near], { campus }),
      ).totalFound,
    ).toBe(1);
    const credits = (min: number | null, max: number | null) =>
      generatePlans(
        request({
          items: [required("CMSC351"), optional("CMSC330")],
          mustHaves: {
            ...DEFAULT_MUST_HAVES,
            enoughTravelTime: false,
            credits: { min, max },
          },
        }),
        data([here, near]),
      ).results.map((r) => r.stats.credits);
    expect(credits(6, null)).toEqual([6]);
    expect(credits(null, 3)).toEqual([3]);
  });

  it("stops at the budgets and reports progress", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      course(
        `CMSC${400 + i}`,
        Array.from({ length: 8 }, (_, k): [string, Day[], number] => [
          `0${k}01`,
          [DAYS[k % 5] as Day],
          480 + i * 60,
        ]),
      ),
    );
    const progress: number[] = [];
    const result = generatePlans(
      request({
        items: many.map((c) => required(c.code)),
        limits: { maxResults: 5, maxSteps: 50_000 },
      }),
      data(many),
      { onProgress: (p) => progress.push(p.steps) },
    );
    expect(result.results).toHaveLength(5);
    expect(result.totalFound).toBeGreaterThan(5);
    expect(result.truncated).toBe(true);
    expect(result.steps).toBe(50_000);
    expect(progress.length).toBeGreaterThan(0);
    const cancelled = generatePlans(
      request({ items: many.map((c) => required(c.code)) }),
      data(many),
      { shouldCancel: () => true },
    );
    expect(cancelled.truncated).toBe(true);
    expect(cancelled.relaxations).toEqual([]);
  });

  it("skips unknown courses when optional and finds nothing when required", () => {
    expect(
      generatePlans(
        request({ items: [required("CMSC351"), optional("NOPE101")] }),
        data([a]),
      ).totalFound,
    ).toBe(3);
    const none = generatePlans(
      request({ items: [required("NOPE101")] }),
      data([a]),
    );
    expect(none.results).toEqual([]);
    expect(none.relaxations).toEqual([]);
  });
});

describe("when nothing fits", () => {
  const a = course("CMSC351", [
    ["0101", ["M", "W", "F"], 540],
    ["0201", ["M", "W", "F"], 600],
  ]);
  const b = course("CMSC330", [["0101", ["M", "W", "F"], 540]]);

  it("suggests relaxations with what each unlocks, most first", () => {
    const req = request({
      items: [required("CMSC351"), required("CMSC330")],
      mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 600, daysOff: ["F"] },
    });
    const result = generatePlans(req, data([a, b]));
    expect(result.results).toEqual([]);
    // Both courses meet only MWF before 10am: no single change is enough.
    expect(result.relaxations).toEqual([]);
    const both = request({
      items: [required("CMSC351"), required("CMSC330")],
      mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 600 },
    });
    const r2 = generatePlans(both, data([a, b]));
    expect(
      r2.relaxations.map((r) => [r.label, r.unlockCount, r.atLeast]),
    ).toEqual([
      ["Allow classes before 10am", 1, false],
      ["Make CMSC330 optional", 1, false],
    ]);
    // A what-if that runs out of budget says "at least".
    const many = (code: string, day: Day) =>
      course(
        code,
        Array.from({ length: 10 }, (_, i): [string, Day[], number] => [
          `0${i + 1}01`.slice(-4),
          [day],
          480 + i * 60,
        ]),
      );
    const cut = generatePlans(
      request({
        items: [required("MATH140"), required("MATH141")],
        mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 1200 },
        limits: { maxResults: 10, maxSteps: 60 },
      }),
      data([many("MATH140", "M"), many("MATH141", "Tu")]),
    );
    expect(cut.relaxations).toEqual([
      expect.objectContaining({ constraint: "earliest-start", atLeast: true }),
    ]);
    const fixed = applyRelaxation(both, r2.relaxations[0]?.patch ?? {});
    expect(generatePlans(fixed, data([a, b])).totalFound).toBe(1);
  });

  it("lists the closest plans with their conflicts marked", () => {
    const tight = request({
      items: [required("CMSC351"), required("CMSC330")],
      mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 600 },
    });
    const { nearMisses } = generatePlans(tight, data([a, b]));
    expect(nearMisses.length).toBeGreaterThan(0);
    const [first] = nearMisses;
    expect(first?.conflicts).toHaveLength(1);
    expect(first?.conflicts[0]).toMatchObject({
      kind: "must-have",
      constraint: "earliest-start",
    });
    const clash = nearMisses.find((m) =>
      m.conflicts.some((c) => c.kind === "overlap"),
    );
    const overlap = clash?.conflicts.find((c) => c.kind === "overlap");
    expect(overlap?.message).toContainEqual({ kind: "text", text: " overlap" });
    expect(overlap?.message).toContainEqual({
      kind: "course",
      courseCode: "CMSC351",
    });
    expect(overlap?.message).toContainEqual({
      kind: "course",
      courseCode: "CMSC330",
    });
    expect(overlap?.day).toBe("M");
  });

  it("offers every kind of relaxation the request allows", () => {
    const req = request({
      items: [
        {
          kind: "course",
          courseCode: "CMSC351",
          required: true,
          sections: ["0101"],
        },
        optional("CMSC330"),
      ],
      blocks: [aBlock()],
      mustHaves: {
        earliestStart: 600,
        latestEnd: 900,
        daysOff: ["M", "F"],
        enoughTravelTime: true,
        openSeatsOnly: true,
        respectBlocks: true,
        credits: { min: 3, max: 12 },
      },
    });
    expect(relaxationOptions(req).map((o) => o.label)).toEqual([
      "Allow classes before 10am",
      "Allow classes after 3pm",
      "Allow classes on Mondays and Fridays",
      "Allow classes without time to walk between them",
      "Include full sections",
      "Ignore my blocks",
      "Any number of credits",
      "Make CMSC351 optional",
      "Allow any section of CMSC351",
    ]);
    const all = applyRelaxation(req, {
      allowAllSections: "CMSC351",
      makeOptional: "CMSC351",
    });
    expect(all.items[0]).toEqual({
      kind: "course",
      courseCode: "CMSC351",
      required: false,
    });
  });

  it("reports full sections, blocks and travel in near-misses", () => {
    const seats: Record<string, SeatTuple> = {
      "CMSC330-0101": aSeatTuple({ open: 0 }),
    };
    const req = request({
      items: [required("CMSC330")],
      blocks: [aBlock({ days: ["M"], start: 500, end: 560 })],
      mustHaves: { ...DEFAULT_MUST_HAVES, openSeatsOnly: true, daysOff: ["W"] },
    });
    const { nearMisses } = generatePlans(req, data([b], { seats }));
    const words = nearMisses[0]?.conflicts.map((c) =>
      c.message
        .map((p) =>
          p.kind === "text" ? p.text : p.kind === "section" ? p.sectionKey : "",
        )
        .join(""),
    );
    expect(words).toEqual([
      "CMSC330-0101 meets on Wednesdays",
      "CMSC330-0101 is full",
      "CMSC330-0101 overlaps one of your blocks",
    ]);
    // Four broken must-haves isn't "near".
    const far = generatePlans(
      { ...req, mustHaves: { ...req.mustHaves, latestEnd: 560 } },
      data([b], { seats }),
    );
    expect(far.nearMisses).toEqual([]);
  });
});

// ---------- scoring ----------

describe("scoring", () => {
  const groups = (c: Course) =>
    candidateGroups(c, {
      mustHaves: DEFAULT_MUST_HAVES,
      blocks: [],
      seats: {
        "CMSC351-0101": aSeatTuple({ open: 6 }),
        "CMSC351-0102": aSeatTuple({ open: 9 }),
      },
      quality: new Map([
        ["CMSC351-0101", { rating: 4.5, gpa: 3.2 }],
        ["CMSC351-0102", { rating: 3, gpa: null }],
      ]),
      only: null,
      keepViolations: false,
    });

  it("treats a merged group as its best member", () => {
    const c = course("CMSC351", [
      ["0101", ["Tu", "Th"], 600],
      ["0102", ["Tu", "Th"], 600],
    ]);
    const [g] = groups(c);
    expect(g?.sections.map((s) => s.code)).toEqual(["0101", "0102"]);
    expect(g).toMatchObject({ openSeats: 15, rating: 4.5, gpa: 3.2 });
    if (!g) throw new Error("expected a group");
    expect(planStats([g])).toMatchObject({
      daysOnCampus: 2,
      firstClass: 600,
      lastClass: 650,
      avgRating: 4.5,
      fewestOpenSeats: 15,
    });
    const breakdown = scoreBreakdown([g]);
    expect(breakdown["best-rated"]).toBeCloseTo(0.875);
    expect(breakdown["fewer-days"]).toBeCloseTo(0.75);
    expect(
      totalScore(breakdown, {
        preset: "custom",
        weights: {
          compact: 0,
          "fewer-days": 1,
          "later-starts": 0,
          "best-rated": 1,
          "higher-gpa": 0,
          "safest-seats": 0,
        },
      }),
    ).toBeCloseTo((0.75 + 0.875) / 2);
    expect(
      totalScore(breakdown, {
        preset: "custom",
        weights: {
          compact: 0,
          "fewer-days": 0,
          "later-starts": 0,
          "best-rated": 0,
          "higher-gpa": 0,
          "safest-seats": 0,
        },
      }),
    ).toBeGreaterThan(0);
  });

  it("scores gaps between classes as less compact, and online days as off campus", () => {
    const spread = course("CMSC351", [["0101", ["M"], 480]]);
    const later = course("CMSC330", [["0101", ["M"], 900]]);
    const online = aCourse({
      code: "ENGL393",
      sections: [
        aSection({
          meetings: [aMeeting({ days: ["F"], online: true, building: null })],
        }),
      ],
    });
    const [g1] = groups(spread);
    const [g2] = candidateGroups(later, {
      mustHaves: DEFAULT_MUST_HAVES,
      blocks: [],
      seats: null,
      quality: new Map(),
      only: null,
      keepViolations: false,
    });
    const [g3] = candidateGroups(online, {
      mustHaves: DEFAULT_MUST_HAVES,
      blocks: [],
      seats: null,
      quality: new Map(),
      only: null,
      keepViolations: false,
    });
    if (!g1 || !g2 || !g3) throw new Error("expected groups");
    const b = scoreBreakdown([g1, g2, g3]);
    expect(b.compact).toBeCloseTo(1 - (900 - 530) / 1200);
    expect(planStats([g1, g2, g3]).daysOnCampus).toBe(1);
    // Monday starts at 8am, Friday (online) at 10am: a 9am average.
    expect(b["later-starts"]).toBeCloseTo(0.25);
    expect(scoreBreakdown([g3])["later-starts"]).toBeCloseTo(0.5);
    const untimed = aCourse({
      code: "ARTH200",
      sections: [aSection({ meetings: [anUntimedMeeting()] })],
    });
    const [g4] = candidateGroups(untimed, {
      mustHaves: DEFAULT_MUST_HAVES,
      blocks: [],
      seats: null,
      quality: new Map(),
      only: null,
      keepViolations: false,
    });
    if (!g4) throw new Error("expected a group");
    expect(scoreBreakdown([g4])).toMatchObject({
      "later-starts": 1,
      "best-rated": 0.5,
      "safest-seats": 0.5,
    });
  });
});

describe("sectionQuality", () => {
  it("joins instructors to PlanetTerp ratings and grades", () => {
    const quality = sectionQuality(mockCourses(), mockPlanetTerpDepts);
    expect(quality.size).toBeGreaterThan(10);
    for (const q of quality.values()) {
      if (q.rating !== null) expect(q.rating).toBeGreaterThanOrEqual(1);
      if (q.gpa !== null) expect(q.gpa).toBeLessThanOrEqual(4);
    }
    expect(
      sectionQuality([aCourse({ code: "ZZZZ100" })], mockPlanetTerpDepts).size,
    ).toBe(0);
  });
});

// ---------- on the mock catalog ----------

describe("on the mock term", () => {
  it("generates ranked plans for a realistic request", () => {
    const courses = mockCourses();
    const req = request({
      items: [
        required("CMSC351"),
        required("CMSC330"),
        required("STAT400"),
        optional("ENGL393"),
      ],
      rankBy: { preset: "compact" },
    });
    const result = generatePlans(req, {
      index: buildCatalogIndex(TERM, courses),
      seats: mockSeats.seats,
      campus: EMPTY_CAMPUS,
      quality: sectionQuality(courses, mockPlanetTerpDepts),
    });
    expect(result.results.length).toBeGreaterThan(0);
    const scores = result.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(GenerateResultSchema.safeParse(result).success).toBe(true);
  });
});

// ---------- properties ----------

const BUILDINGS = ["IRB", "ESJ", "KEY"];
const PATTERNS: Day[][] = [
  ["M", "W", "F"],
  ["Tu", "Th"],
  ["M", "W"],
  ["F"],
  ["Sa"],
];

const sectionArb = fc.record({
  pattern: fc.integer({ min: 0, max: PATTERNS.length - 1 }),
  startSlot: fc.integer({ min: 0, max: 24 }),
  long: fc.boolean(),
  building: fc.constantFrom(...BUILDINGS),
  open: fc.integer({ min: 0, max: 3 }),
});

const catalogArb = fc
  .array(fc.array(sectionArb, { minLength: 1, maxLength: 4 }), {
    minLength: 1,
    maxLength: 4,
  })
  .map((courses) => {
    const seats: Record<string, SeatTuple> = {};
    const list = courses.map((sections, i) => {
      const code = `TEST${100 + i}`;
      return aCourse({
        code,
        credits: { min: 3, max: 3 },
        sections: sections.map((s, k) => {
          const sectionCode = `0${k + 1}01`;
          seats[`${code}-${sectionCode}`] = aSeatTuple({
            open: s.open,
            total: 3,
          });
          const start = 480 + s.startSlot * 30;
          return aSection({
            code: sectionCode,
            meetings: [
              aMeeting({
                days: PATTERNS[s.pattern],
                start,
                end: start + (s.long ? 75 : 50),
                building: s.building,
              }),
            ],
          });
        }),
      });
    });
    return { courses: list, seats };
  });

const mustHavesArb: fc.Arbitrary<MustHaves> = fc.record({
  earliestStart: fc.option(fc.integer({ min: 480, max: 720 }), { nil: null }),
  latestEnd: fc.option(fc.integer({ min: 720, max: 1260 }), { nil: null }),
  daysOff: fc.subarray([...DAYS] as Day[]).map((d) => [...d]),
  enoughTravelTime: fc.boolean(),
  openSeatsOnly: fc.boolean(),
  respectBlocks: fc.boolean(),
  credits: fc.record({
    min: fc.option(fc.constantFrom(3, 6), { nil: null }),
    max: fc.option(fc.constantFrom(6, 9), { nil: null }),
  }),
});

const campus = campusMap(
  decodeRoutes(
    encodeRoutes({
      buildings: BUILDINGS,
      distance: (_m, x, y) => (x < y ? 1500 : 2800),
    }),
  ),
  null,
);

describe("properties", () => {
  it("never returns overlapping plans, and always respects the must-haves", () => {
    fc.assert(
      fc.property(
        catalogArb,
        mustHavesArb,
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        ({ courses, seats }, mustHaves, requiredFlags) => {
          const blocks = [aBlock({ days: ["Tu"], start: 720, end: 780 })];
          const req = request({
            items: courses.map((c, i) => ({
              kind: "course",
              courseCode: c.code,
              required: requiredFlags[i] ?? true,
            })),
            mustHaves,
            blocks,
            travel: DEFAULT_TRAVEL_SETTINGS,
            limits: DEFAULT_GENERATE_LIMITS,
          });
          const index = buildCatalogIndex(TERM, courses);
          const result = generatePlans(req, {
            index,
            seats,
            campus,
            quality: new Map(),
          });
          for (const plan of result.results) {
            const refs = plan.sections.map((k) => {
              const ref = index.sections.get(k);
              if (!ref) throw new Error(`unknown ${k}`);
              return ref;
            });
            const items = refs.flatMap((r) =>
              sectionWeekItems(r.course.code, r.section),
            );
            for (let i = 0; i < items.length; i++)
              for (let j = i + 1; j < items.length; j++) {
                const x = items[i];
                const y = items[j];
                if (x && y && x.source.sectionKey !== y.source.sectionKey)
                  expect(itemsOverlap(x, y)).toBe(false);
              }
            for (const item of items) {
              if (mustHaves.earliestStart !== null)
                expect(item.start).toBeGreaterThanOrEqual(
                  mustHaves.earliestStart,
                );
              if (mustHaves.latestEnd !== null)
                expect(item.end).toBeLessThanOrEqual(mustHaves.latestEnd);
              expect(mustHaves.daysOff).not.toContain(item.day);
              if (mustHaves.respectBlocks)
                for (const b of blocks.flatMap(blockWeekItems))
                  expect(itemsOverlap(item, b)).toBe(false);
            }
            if (mustHaves.openSeatsOnly)
              for (const k of plan.sections)
                expect(seats[k]?.[0]).toBeGreaterThan(0);
            const credits = plan.stats.credits;
            if (mustHaves.credits.min !== null)
              expect(credits).toBeGreaterThanOrEqual(mustHaves.credits.min);
            if (mustHaves.credits.max !== null)
              expect(credits).toBeLessThanOrEqual(mustHaves.credits.max);
            if (mustHaves.enoughTravelTime)
              for (const c of planConnections(
                refs,
                DEFAULT_TRAVEL_SETTINGS,
                campus,
              ))
                expect(c.verdict).not.toBe("insufficient");
            courses.forEach((c, i) => {
              if (requiredFlags[i] ?? true)
                expect(
                  plan.sections.some((k) => k.startsWith(`${c.code}-`)),
                ).toBe(true);
            });
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it("finds exactly the valid combinations a brute force finds", () => {
    fc.assert(
      fc.property(catalogArb, ({ courses }) => {
        const req = request({
          items: courses.map((c) => ({
            kind: "course",
            courseCode: c.code,
            required: true,
          })),
          mustHaves: { ...DEFAULT_MUST_HAVES, enoughTravelTime: false },
        });
        const result = generatePlans(req, data(courses));
        const groups = courses.map((c) =>
          candidateGroups(c, {
            mustHaves: req.mustHaves,
            blocks: [],
            seats: null,
            quality: new Map(),
            only: null,
            keepViolations: false,
          }),
        );
        let count = 0;
        const walk = (i: number, chosen: (typeof groups)[number]): void => {
          if (i === groups.length) {
            count++;
            return;
          }
          for (const g of groups[i] ?? []) {
            const clash = chosen.some((o) =>
              o.items.some((x) => g.items.some((y) => itemsOverlap(x, y))),
            );
            if (!clash) walk(i + 1, [...chosen, g]);
          }
        };
        walk(0, []);
        expect(result.totalFound).toBe(count);
      }),
      { numRuns: 150 },
    );
  });
});

describe("mock seats", () => {
  it("exist for the mock term", () => {
    expect(Object.keys(mockSeats.seats).length).toBeGreaterThan(0);
  });
});
