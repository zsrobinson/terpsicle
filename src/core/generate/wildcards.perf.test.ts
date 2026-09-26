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
  type GenItem,
  type SeatTuple,
} from "../schema";
import { campusMap } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import { type GenerateData, generatePlans } from "./generate";

// Wildcards on a term-sized catalog: a gen-ed that matches hundreds of
// courses (some with dozens of sections) and a department pattern that
// matches dozens, beside four ordinary courses, travel and blocks on. The
// cap (wildcards.ts) is what keeps this near BUILD §5's generator budget.

const BUDGET_MS = 400;
const BUILDINGS = ["IRB", "ESJ", "CSI", "KEY", "MTH", "PHY", "TWS", "SQH"];
const PATTERNS: Day[][] = [
  ["M", "W", "F"],
  ["Tu", "Th"],
  ["M", "W"],
];

function syntheticTerm(): {
  courses: Course[];
  seats: Record<string, SeatTuple>;
} {
  const rand = seededRandom("wildcards-perf");
  const seats: Record<string, SeatTuple> = {};
  const courses: Course[] = [];
  const add = (code: string, sections: number, genEd: string | null) => {
    courses.push(
      aCourse({
        code,
        genEds: genEd ? [[{ code: genEd }]] : [],
        sections: Array.from({ length: sections }, (_, k) => {
          const sectionCode = `0${String(k + 1).padStart(2, "0")}1`;
          const pattern = PATTERNS[randomInt(rand, 0, 2)] ?? ["M"];
          const start = 480 + randomInt(rand, 0, 18) * 30;
          seats[`${code}-${sectionCode}`] = aSeatTuple({
            open: randomInt(rand, 0, 30),
            total: 30,
          });
          return aSection({
            code: sectionCode,
            instructors: [`Instructor ${randomInt(rand, 1, 9)}`],
            meetings: [
              aMeeting({
                days: pattern,
                start,
                end: start + (pattern.length === 2 ? 75 : 50),
                building: BUILDINGS[randomInt(rand, 0, BUILDINGS.length - 1)],
              }),
            ],
          });
        }),
      }),
    );
  };
  // 4,000 courses in 100 departments; one in ten counts for DSHS, and a
  // few of those are big intro courses.
  for (let d = 0; d < 100; d++) {
    const dept = `D${String.fromCharCode(65 + (d % 26))}${String.fromCharCode(65 + Math.floor(d / 26))}X`;
    for (let n = 0; n < 40; n++) {
      const big = n < 2 && d % 10 === 0;
      add(
        `${dept}${100 + n * 10}`,
        big ? 30 : randomInt(rand, 1, 4),
        n % 10 === 3 || big ? "DSHS" : null,
      );
    }
  }
  // The ordinary courses: 20 sections each.
  for (let i = 0; i < 4; i++) add(`PERF${300 + i}`, 20, null);
  return { courses, seats };
}

describe("wildcard performance", () => {
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
  const ordinary: GenItem[] = [300, 301, 302, 303].map((n) => ({
    kind: "course",
    courseCode: `PERF${n}`,
    required: true,
  }));
  const request = (items: GenItem[]): GenerateRequest =>
    aGenerateRequest({
      items,
      blocks: [aBlock({ days: ["Tu", "Th"], start: 720, end: 780 })],
    });

  const wildcards: GenItem[] = [
    {
      kind: "wildcard",
      wildcard: { kind: "gen-ed", code: "DSHS" },
      required: true,
      count: 1,
    },
    {
      // A department ending in X, as a few do.
      kind: "wildcard",
      wildcard: { kind: "pattern", pattern: "DAAXXXX" },
      required: true,
      count: 2,
    },
  ];

  it(`generates 4 courses + a gen-ed + a department (×2) in under ${BUDGET_MS} ms`, () => {
    let found = 0;
    let steps = 0;
    let tried = "";
    const ms = medianMs(
      () => {
        const result = generatePlans(
          request([...ordinary, ...wildcards]),
          data,
        );
        found = result.totalFound;
        steps = result.steps;
        tried = result.wildcards
          .map((w) => `${w.wildcard} ${w.tried}/${w.fit}/${w.matched}`)
          .join(", ");
      },
      { runs: 5, warmups: 1 },
    );
    console.info(
      `generate with wildcards: ${ms.toFixed(1)} ms, ${found} plans in ${steps} steps (${tried})`,
    );
    expect(found).toBeGreaterThan(0);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("answers a nothing-fits request with wildcards in under a second", () => {
    let relaxations = 0;
    const ms = medianMs(
      () => {
        const result = generatePlans(
          {
            ...request([...ordinary, ...wildcards]),
            mustHaves: { ...DEFAULT_MUST_HAVES, earliestStart: 900 },
          },
          data,
        );
        relaxations = result.relaxations.length;
      },
      { runs: 5, warmups: 1 },
    );
    console.info(
      `generate with wildcards, nothing fits: ${ms.toFixed(1)} ms, ${relaxations} relaxations`,
    );
    expect(ms).toBeLessThan(1000);
  });
});
