import { describe, expect, it } from "vitest";
import {
  aBlock,
  aCourse,
  aMeeting,
  aPlan,
  aPlanCourse,
  aSeatTuple,
  aSection,
  fixtureTermId,
  randomInt,
  seededRandom,
  snapshotOf,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { buildFitContext, prepareFit } from "../fit/fit";
import {
  type Course,
  DAYS,
  type Day,
  DEFAULT_TRAVEL_SETTINGS,
  type SeatTuple,
} from "../schema";
import { campusMap } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import { courseFilter, NO_FILTERS } from "./filters";
import { createCourseSearch, searchCourses } from "./search";

// BUILD §5: a search keystroke over a full term (~4,500 courses) stays under
// one frame (16 ms), filters included.

const FRAME_MS = 16;

const WORDS =
  "algorithms data structures introduction advanced topics theory systems design analysis programming languages calculus linear algebra probability statistics writing literature history culture society economics markets policy biology chemistry physics ecology genetics music art film theater ethics philosophy psychology learning networks security machine vision robotics signals circuits materials energy climate public health nutrition marketing finance accounting management leadership".split(
    " ",
  );
const NAMES =
  "Ada Brandt Clyde Kruskal Anwar Mamat Maria Chen Jose Perez Li Wei Omar Haddad Grace Kim Ravi Patel Nora Fields Sam Okafor Ivy Tanaka Leo Moreno Zoe Adeyemi".split(
    " ",
  );
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
  ["F"],
  ["Tu"],
];

/** A deterministic synthetic term: 180 departments × 25 courses, 1–12 sections each. */
function syntheticCatalog(): {
  courses: Course[];
  seats: Record<string, SeatTuple>;
} {
  const rand = seededRandom("perf-catalog");
  const pick = <T>(list: readonly T[]): T =>
    list[randomInt(rand, 0, list.length - 1)] as T;
  const courses: Course[] = [];
  const seats: Record<string, SeatTuple> = {};
  const depts = new Set<string>();
  while (depts.size < 180) {
    depts.add(
      Array.from({ length: 4 }, () =>
        String.fromCharCode(65 + randomInt(rand, 0, 25)),
      ).join(""),
    );
  }
  for (const dept of [...depts].sort()) {
    const numbers = new Set<number>();
    while (numbers.size < 25) numbers.add(randomInt(rand, 100, 799));
    for (const n of [...numbers].sort()) {
      const code = `${dept}${n}`;
      const sections = Array.from(
        { length: randomInt(rand, 1, 12) },
        (_, i) => {
          const start = 480 + randomInt(rand, 0, 20) * 30;
          const sectionCode = `0${String(i + 1).padStart(2, "0")}1`;
          seats[`${code}-${sectionCode}`] = aSeatTuple({
            open: randomInt(rand, 0, 40),
            total: 40,
          });
          return aSection({
            code: sectionCode,
            instructors: [`${pick(NAMES)} ${pick(NAMES)}`],
            meetings: [
              aMeeting({
                days: pick(PATTERNS),
                start,
                end: start + 50,
                building: pick(BUILDINGS),
              }),
            ],
          });
        },
      );
      courses.push(
        aCourse({
          code,
          title: Array.from({ length: randomInt(rand, 2, 5) }, () =>
            pick(WORDS),
          ).join(" "),
          credits: { min: 3, max: randomInt(rand, 3, 4) },
          genEds:
            rand() < 0.2
              ? [[{ code: pick(["DSHU", "DSNS", "DSHS", "FSMA"]) }]]
              : [],
          sections,
        }),
      );
    }
  }
  return { courses, seats };
}

/** Best of a few runs after a few warm-ups, so JIT tiers and GC pauses don't fail CI. */
function timeMs(run: () => void, repeats = 5, warmups = 3): number {
  for (let i = 0; i < warmups; i++) run();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < repeats; i++) {
    const t = performance.now();
    run();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

function keystrokes(text: string): string[] {
  return Array.from({ length: text.length }, (_, i) => text.slice(0, i + 1));
}

describe("search performance", () => {
  const { courses, seats } = syntheticCatalog();
  // Built once per catalog load, on the main thread (src/worker/README.md).
  const indexStart = performance.now();
  const search = createCourseSearch(courses);
  const indexMs = performance.now() - indexStart;
  // What the worker does once per catalog load.
  const prepareStart = performance.now();
  prepareFit(courses);
  const prepareMs = performance.now() - prepareStart;
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const plan = aPlan({
    courses: [courses[10], courses[2000]].map((c) => {
      const section = c?.sections[0];
      if (!c || !section) throw new Error("the synthetic catalog is too small");
      return aPlanCourse({
        courseCode: c.code,
        sectionCode: section.code,
        snapshot: snapshotOf(section),
      });
    }),
  });
  const routes = decodeRoutes(
    encodeRoutes({
      buildings: BUILDINGS,
      distance: (_m, x, y) => (x < y ? 900 : 1200),
    }),
  );
  const fit = buildFitContext({
    plan,
    index: buildCatalogIndex(fixtureTermId, courses),
    blocks: [aBlock({ days: [...DAYS].slice(0, 5) })],
    travel: DEFAULT_TRAVEL_SETTINGS,
    campus: campusMap(routes, null),
  });

  it("has a realistic catalog", () => {
    console.info(`prepareFit once per catalog: ${prepareMs.toFixed(0)} ms`);
    console.info(`search index once per catalog: ${indexMs.toFixed(0)} ms`);
    expect(courses.length).toBe(4500);
    expect(courses.reduce((n, c) => n + c.sections.length, 0)).toBeGreaterThan(
      25_000,
    );
  });

  it(`answers every keystroke in under ${FRAME_MS} ms, filters included`, () => {
    const filters = {
      ...NO_FILTERS,
      openSeats: true,
      fitsMyPlan: true,
      levels: [300, 400],
    };
    const keep = courseFilter(filters, { seats, fit });
    const queries = [
      ...keystrokes("cmsc 351"),
      ...keystrokes("algoritms"),
      ...keystrokes("kruskal"),
      ...keystrokes("351"),
      ...keystrokes("data structures and algorithms"),
    ];
    const times = queries.map((q) => ({
      q,
      ms: timeMs(() => {
        const codes = searchCourses(search, q);
        codes.filter((code) => {
          const course = byCode.get(code);
          return course !== undefined && keep(course);
        });
      }),
    }));
    const worst = times.reduce((w, t) => (t.ms > w.ms ? t : w));
    console.info(
      `search keystroke: worst ${worst.ms.toFixed(2)} ms ("${worst.q}"), median ${times
        .map((t) => t.ms)
        .sort((x, y) => x - y)
        [Math.floor(times.length / 2)]?.toFixed(
          2,
        )} ms over ${times.length} keystrokes`,
    );
    expect(worst.ms).toBeLessThan(FRAME_MS);
  });

  it("filters the whole term by Fits my plan in under a frame after a plan change", () => {
    const index = buildCatalogIndex(fixtureTermId, courses);
    // A fresh context each run: the first keystroke after a plan change pays for all of it.
    const ms = timeMs(
      () => {
        const fresh = buildFitContext({
          plan,
          index,
          blocks: [],
          travel: DEFAULT_TRAVEL_SETTINGS,
          campus: campusMap(routes, null),
        });
        courses.filter(
          courseFilter(
            { ...NO_FILTERS, fitsMyPlan: true },
            { seats, fit: fresh },
          ),
        );
      },
      // Plans change many times a session, so this measures the warmed-up path.
      5,
      10,
    );
    console.info(
      `fits my plan over ${courses.length} courses after a plan change: ${ms.toFixed(2)} ms`,
    );
    expect(ms).toBeLessThan(FRAME_MS);
  });
});
