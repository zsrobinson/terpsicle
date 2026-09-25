import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATE_LIMITS,
  DEFAULT_MUST_HAVES,
  type GenerateRequest,
  GenerateRequestSchema,
  type GenerateResult,
  GenerateResultSchema,
  RankBySchema,
} from "./generate";
import { FitLabelSchema, ProblemSchema } from "./problems";
import { DEFAULT_TRAVEL_SETTINGS } from "./travel";

const TERM = "202701";

describe("generator I/O", () => {
  it("accepts required, optional and pick-N items", () => {
    const req: GenerateRequest = {
      termId: TERM,
      items: [
        { kind: "course", courseCode: "CMSC351", required: true },
        {
          kind: "course",
          courseCode: "STAT400",
          required: false,
          sections: ["0101", "0301"],
        },
        {
          kind: "pick",
          id: "g1",
          count: 1,
          courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
        },
      ],
      mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 600, daysOff: ["F"] },
      rankBy: { preset: "fewer-days" },
      blocks: [],
      travel: DEFAULT_TRAVEL_SETTINGS,
      limits: DEFAULT_GENERATE_LIMITS,
    };
    expect(GenerateRequestSchema.parse(req)).toEqual(req);
  });

  it("rejects a pick group asking for more courses than it lists", () => {
    const item = {
      kind: "pick",
      id: "g1",
      count: 3,
      courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
    };
    const req = {
      termId: TERM,
      items: [item],
      mustHaves: DEFAULT_MUST_HAVES,
      rankBy: { preset: "compact" },
      blocks: [],
      travel: DEFAULT_TRAVEL_SETTINGS,
      limits: DEFAULT_GENERATE_LIMITS,
    };
    expect(GenerateRequestSchema.safeParse(req).success).toBe(false);
  });

  it("needs a weight for every factor in custom ranking", () => {
    const weights = {
      compact: 1,
      "fewer-days": 0.5,
      "later-starts": 0,
      "best-rated": 0.8,
      "higher-gpa": 0.2,
      "safest-seats": 0.3,
    };
    expect(RankBySchema.safeParse({ preset: "custom", weights }).success).toBe(
      true,
    );
    const { compact: _dropped, ...partial } = weights;
    expect(
      RankBySchema.safeParse({ preset: "custom", weights: partial }).success,
    ).toBe(false);
  });

  it("accepts a result with equivalents, relaxations and near-misses", () => {
    const breakdown = {
      compact: 0.9,
      "fewer-days": 0.6,
      "later-starts": 0.4,
      "best-rated": 0.7,
      "higher-gpa": 0.5,
      "safest-seats": 0.2,
    };
    const result: GenerateResult = {
      results: [
        {
          id: "CMSC351-0101,MUSC130-0101",
          sections: ["CMSC351-0101", "MUSC130-0101"],
          skipped: ["PHIL140"],
          score: 0.73,
          breakdown,
          stats: {
            credits: 6,
            daysOnCampus: 3,
            firstClass: 570,
            lastClass: 645,
            avgRating: 4.2,
            avgGpa: 3.1,
            fewestOpenSeats: 0,
          },
          equivalents: {
            count: 3,
            byCourse: [
              { courseCode: "CMSC351", sectionCodes: ["0101", "0102", "0103"] },
            ],
          },
        },
      ],
      totalFound: 1,
      truncated: false,
      capped: false,
      steps: 42,
      relaxations: [
        {
          constraint: "earliest-start",
          label: "Allow classes before 10am",
          unlockCount: 38,
          atLeast: false,
          patch: { mustHaves: { earliestStart: null } },
        },
      ],
      nearMisses: [
        {
          sections: ["CMSC351-0101", "STAT400-0101"],
          skipped: [],
          conflicts: [
            {
              kind: "overlap",
              sectionKeys: ["CMSC351-0101", "STAT400-0101"],
              day: "Tu",
              message: [
                { kind: "course", courseCode: "CMSC351" },
                { kind: "text", text: " overlaps " },
                { kind: "course", courseCode: "STAT400" },
              ],
            },
          ],
        },
      ],
    };
    expect(GenerateResultSchema.parse(result)).toEqual(result);
  });
});

describe("problems and fit labels", () => {
  const problem = {
    id: "full:CMSC351-0101",
    severity: "warning",
    kind: "full",
    subjects: [{ kind: "section", sectionKey: "CMSC351-0101" }],
    title: [
      { kind: "section", sectionKey: "CMSC351-0101" },
      { kind: "text", text: " is full" },
    ],
    detail: [{ kind: "text", text: "14 on the waitlist" }],
    fix: {
      kind: "switch",
      sectionKey: "CMSC351-0201",
      label: "Switch to 0201",
    },
  };

  it("accepts a problem whose severity matches its kind", () => {
    expect(ProblemSchema.safeParse(problem).success).toBe(true);
    expect(
      ProblemSchema.safeParse({ ...problem, severity: "error" }).success,
    ).toBe(false);
    expect(ProblemSchema.safeParse({ ...problem, subjects: [] }).success).toBe(
      false,
    );
  });

  it("accepts every fit label", () => {
    const labels = [
      { kind: "fits" },
      { kind: "overlaps", with: { kind: "course", courseCode: "ENGL393" } },
      {
        kind: "overlaps",
        with: { kind: "block", blockId: "blk_12345678", label: "Lunch" },
      },
      { kind: "not-enough-time", direction: "after", courseCode: "CMSC330" },
      { kind: "in-plan" },
      { kind: "no-set-times" },
    ];
    for (const label of labels)
      expect(FitLabelSchema.safeParse(label).success).toBe(true);
    expect(FitLabelSchema.safeParse({ kind: "tight" }).success).toBe(false);
  });
});
