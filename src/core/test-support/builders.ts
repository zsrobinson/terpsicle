import type {
  Block,
  Course,
  Plan,
  PlanCourse,
  Section,
  TimedMeeting,
  UntimedMeeting,
} from "../schema";
import { snapshotOf } from "../catalog/catalog-index";

// Temporary test builders until src/fixtures lands its own (aCourse, aSection, …).
// Term ids stay in the tests (lint keeps them out of source), so plans and
// blocks take one.

export function aMeeting(overrides: Partial<TimedMeeting> = {}): TimedMeeting {
  return {
    timed: true,
    days: ["M", "W", "F"],
    start: 600,
    end: 650,
    kind: "lecture",
    building: "IRB",
    room: "0318",
    online: false,
    ...overrides,
  };
}

export function anUntimedMeeting(
  overrides: Partial<UntimedMeeting> = {},
): UntimedMeeting {
  return {
    timed: false,
    kind: "lecture",
    building: null,
    room: null,
    online: true,
    ...overrides,
  };
}

export function aSection(overrides: Partial<Section> = {}): Section {
  return {
    code: "0101",
    instructors: ["Clyde Kruskal"],
    delivery: "f2f",
    meetings: [aMeeting()],
    notes: null,
    restriction: null,
    ...overrides,
  };
}

export function aCourse(overrides: Partial<Course> = {}): Course {
  return {
    code: "CMSC351",
    title: "Algorithms",
    credits: { min: 3, max: 3 },
    genEds: [],
    gradingMethods: ["Reg"],
    permission: null,
    description: null,
    prerequisite: null,
    corequisite: null,
    restriction: null,
    otherNotes: [],
    crossListings: [],
    sections: [aSection()],
    ...overrides,
  };
}

/** A placed plan course from a catalog course and one of its section codes. */
export function placed(course: Course, sectionCode: string): PlanCourse {
  const section = course.sections.find((s) => s.code === sectionCode);
  if (!section) throw new Error(`${course.code} has no section ${sectionCode}`);
  return { courseCode: course.code, sectionCode, snapshot: snapshotOf(section) };
}

export function saved(courseCode: string): PlanCourse {
  return { courseCode, sectionCode: null, snapshot: null };
}

export function aPlan(overrides: Partial<Plan> & Pick<Plan, "termId">): Plan {
  return {
    id: "plan-aaaa",
    name: "Plan A",
    order: 0,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    courses: [],
    ...overrides,
  };
}

export function aBlock(overrides: Partial<Block> & Pick<Block, "termId">): Block {
  return {
    id: "block-aaaa",
    label: "Lunch",
    days: ["M", "W", "F"],
    start: 720,
    end: 780,
    ...overrides,
  };
}
