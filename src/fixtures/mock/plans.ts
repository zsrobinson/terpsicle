// Demo plans for `pnpm dev:mock` and e2e: what a returning student has.
import type { Block, CourseColorPref, Plan, PlanCourse } from "~/core/schema";
import {
  aBlock,
  archivedFixtureTermId,
  aSavedCourse,
  FIXTURE_NOW,
  fixtureTermId,
  snapshotOf,
} from "../builders";
import { mockSection } from "./catalog";
import { cancelledSectionBefore, movedSectionBefore } from "./changes";

/** A placed course whose snapshot matches the mock catalog. */
function placed(key: string, termId = fixtureTermId): PlanCourse {
  const [courseCode = "", sectionCode = ""] = key.split("-");
  return {
    courseCode,
    sectionCode,
    snapshot: snapshotOf(mockSection(key, termId)),
  };
}

/**
 * Plan A: five courses, 16 credits, like the prototype's Plan A. On purpose:
 * - ENGL393 0101 overlaps CMSC330's TuTh 9:30am lecture (two options still being weighed);
 * - STAT400 (ESJ, ends 10:50) to CMSC351 (CSI, 11:00) on MWF is a tight connection:
 *   1,999 ft is 8 min at the typical pace, in a 10-minute gap;
 * - CMSC351 0301 has 3 seats left.
 * MUSC130 and PHIL140 are saved for later.
 */
export const demoPlan: Plan = {
  id: "plan_demo_a",
  termId: fixtureTermId,
  name: "Plan A",
  order: 0,
  createdAt: "2026-09-20T15:00:00.000Z",
  updatedAt: FIXTURE_NOW,
  courses: [
    placed("CMSC351-0301"),
    placed("CMSC330-0103"),
    placed("STAT400-0101"),
    placed("ENGL393-0101"),
    placed("ECON200-0101"),
    aSavedCourse("MUSC130"),
    aSavedCourse("PHIL140"),
  ],
};

/**
 * Plan B: 15 credits, and two catalog changes since it was made:
 * AAAS100 0501 moved (its snapshot has the old times) and CMSC320 0301 was
 * cancelled (it's gone from the catalog). CMSC351 0101 is full.
 */
export const demoPlanB: Plan = {
  id: "plan_demo_b",
  termId: fixtureTermId,
  name: "Plan B",
  order: 1,
  createdAt: "2026-09-21T15:00:00.000Z",
  updatedAt: FIXTURE_NOW,
  courses: [
    placed("CMSC351-0101"),
    placed("CMSC330-0202"),
    {
      courseCode: "AAAS100",
      sectionCode: "0501",
      snapshot: movedSectionBefore,
    },
    {
      courseCode: "CMSC320",
      sectionCode: "0301",
      snapshot: cancelledSectionBefore,
    },
    placed("GEOL123-0101"),
  ],
};

/** A plan in the archived term: it still opens, but its seats are frozen. */
export const demoArchivedPlan: Plan = {
  id: "plan_demo_summer",
  termId: archivedFixtureTermId,
  name: "Summer plan",
  order: 0,
  createdAt: "2026-03-02T15:00:00.000Z",
  updatedAt: "2026-03-02T15:00:00.000Z",
  courses: [
    placed("CMSC131-0101", archivedFixtureTermId),
    placed("CMSC330-0101", archivedFixtureTermId),
  ],
};

export const demoPlans: readonly Plan[] = [
  demoPlan,
  demoPlanB,
  demoArchivedPlan,
];

/** The term's blocks: labeled busy time, no place (SPEC §3.8). */
export const demoBlocks: readonly Block[] = [
  aBlock({
    id: "block_demo_work",
    label: "Work",
    days: ["F"],
    start: 780,
    end: 960,
  }),
];

/** A couple of courses with a color picked by hand. */
export const demoCourseColors: readonly CourseColorPref[] = [
  { courseCode: "CMSC351", color: "violet" },
  { courseCode: "ENGL393", color: "amber" },
];
