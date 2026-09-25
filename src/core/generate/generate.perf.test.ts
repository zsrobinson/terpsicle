import { describe, expect, it } from "vitest";
import {
  aBlock,
  aCourse,
  aGenerateRequest,
  aMeeting,
  aSeatTuple,
  aSection,
  fixtureTermId,
  medianMs,
  randomInt,
  seededRandom,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import {
  type Course,
  type Day,
  DEFAULT_MUST_HAVES,
  type GenerateRequest,
  type SeatTuple,
} from "../schema";
import { campusMap } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import { type GenerateData, generatePlans } from "./generate";

// BUILD §5: 7 courses × 20 sections in under 200 ms, travel and blocks on.

const BUDGET_MS = 200;
const BUILDINGS = [
  "IRB",
  "ESJ",
  "CSI",
  "KEY",
  "MTH",
  "PHY",
  "TWS",
  "SQH",
  "HJP",
  "ARM",
];
const PATTERNS: Day[][] = [
  ["M", "W", "F"],
  ["Tu", "Th"],
  ["M", "W"],
];

function syntheticTerm(): {
  courses: Course[];
  seats: Record<string, SeatTuple>;
} {
  const rand = seededRandom("generate-perf");
  const seats: Record<string, SeatTuple> = {};
  const courses = Array.from({ length: 7 }, (_, i) => {
    const code = `PERF${300 + i}`;
    return aCourse({
      code,
      sections: Array.from({ length: 20 }, (_, k) => {
        const sectionCode = `0${String(k + 1).padStart(2, "0")}1`;
        const pattern = PATTERNS[randomInt(rand, 0, PATTERNS.length - 1)] ?? [
          "M",
        ];
        const start = 480 + randomInt(rand, 0, 18) * 30;
        seats[`${code}-${sectionCode}`] = aSeatTuple({
          open: randomInt(rand, 0, 30),
          total: 30,
        });
        return aSection({
          code: sectionCode,
          instructors: [`Instructor ${randomInt(rand, 1, 6)}`],
          meetings: [
            aMeeting({
              days: pattern,
              start,
              end: start + (pattern.length === 2 ? 75 : 50),
              building:
                BUILDINGS[randomInt(rand, 0, BUILDINGS.length - 1)] ?? "IRB",
            }),
          ],
        });
      }),
    });
  });
  return { courses, seats };
}

describe("generator performance", () => {
  const { courses, seats } = syntheticTerm();
  const routes = decodeRoutes(
    encodeRoutes({
      buildings: BUILDINGS,
      distance: (_m, a, b) =>
        600 + ((a.charCodeAt(0) * b.charCodeAt(1)) % 2400),
    }),
  );
  const data: GenerateData = {
    index: buildCatalogIndex(fixtureTermId, courses),
    seats,
    campus: campusMap(routes, null),
    quality: new Map(),
  };
  const request = (overrides: Partial<GenerateRequest> = {}): GenerateRequest =>
    aGenerateRequest({
      items: courses.map((c) => ({
        kind: "course",
        courseCode: c.code,
        required: true,
      })),
      blocks: [aBlock({ days: ["Tu", "Th"], start: 720, end: 780 })],
      ...overrides,
    });

  it(`generates 7 courses × 20 sections in under ${BUDGET_MS} ms`, () => {
    let found = 0;
    let steps = 0;
    const ms = medianMs(() => {
      const result = generatePlans(request(), data);
      found = result.totalFound;
      steps = result.steps;
    });
    console.info(
      `generate 7×20: ${ms.toFixed(1)} ms, ${found} plans found in ${steps} steps`,
    );
    expect(found).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("answers a nothing-fits request (relaxations and near-misses) in under a second", () => {
    let relaxations = 0;
    const ms = medianMs(
      () => {
        const result = generatePlans(
          request({ mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 900 } }),
          data,
        );
        relaxations = result.relaxations.length;
      },
      { runs: 5, warmups: 1 },
    );
    console.info(
      `generate, nothing fits: ${ms.toFixed(1)} ms, ${relaxations} relaxations`,
    );
    expect(ms).toBeLessThan(1000);
  });
});
