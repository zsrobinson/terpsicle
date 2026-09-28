import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { aPlan, aPlanCourse } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import {
  NO_SCHEDULER_COURSES,
  readSchedulerCourses,
  todoCourseColors,
} from "./course-colors";

let dbCount = 0;

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).flatMap((d) => (d.name ? [d.name] : []));
}

describe("readSchedulerCourses", () => {
  it("answers nothing without creating a database when there isn't one", async () => {
    const name = `todo-colors-${++dbCount}`;
    expect(await readSchedulerCourses(name)).toEqual(NO_SCHEDULER_COURSES);
    expect(await databaseNames()).not.toContain(name);
  });

  it("reads the scheduler's colors and plan courses, skipping bad rows", async () => {
    const name = `todo-colors-${++dbCount}`;
    const db = new TerpsicleDb(name);
    await db.courseColors.bulkPut([
      { courseCode: "CMSC216", color: "teal" },
      // A row from some future shape: skipped, never fatal.
      { courseCode: "MATH240", color: "chartreuse" } as never,
    ]);
    await db.plans.put(
      aPlan({ courses: [aPlanCourse({ courseCode: "ENEE222" })] }),
    );
    db.close();
    const read = await readSchedulerCourses(name);
    expect(read.colors).toEqual({ CMSC216: "teal" });
    expect([...read.planCourses]).toEqual(["ENEE222"]);
  });
});

describe("readSchedulerCourses and main plans", () => {
  it("reads only each term's main plan: drafts stay in Schedule", async () => {
    const name = `todo-colors-${++dbCount}`;
    const db = new TerpsicleDb(name);
    const planA = aPlan({
      id: "plan_a_000001",
      courses: [aPlanCourse({ courseCode: "ENEE222" })],
    });
    const planB = aPlan({
      id: "plan_b_000001",
      name: "Plan B",
      order: 1,
      courses: [aPlanCourse({ courseCode: "MATH240" })],
    });
    const fall = aPlan({
      id: "plan_fall_001",
      termId: "202608",
      name: "Fall plan",
      courses: [aPlanCourse({ courseCode: "CMSC131" })],
    });
    await db.plans.bulkPut([planA, planB, fall]);
    await db.settings.put({
      key: "mainPlans",
      value: { [planB.termId]: planB.id },
    });
    db.close();
    const read = await readSchedulerCourses(name);
    expect([...read.planCourses].sort()).toEqual(["CMSC131", "MATH240"]);
    expect(read.mainPlans).toEqual({
      [planB.termId]: { id: planB.id, name: "Plan B" },
      "202608": { id: fall.id, name: "Fall plan" },
    });
  });
});

describe("todoCourseColors", () => {
  it("keeps the scheduler's colors and gives the rest distinct ones", () => {
    const colors = todoCourseColors(["MATH240", "CMSC216", "ENGL101"], {
      CMSC216: "teal",
    });
    expect(colors.CMSC216).toBe("teal");
    expect(new Set(Object.values(colors)).size).toBe(3);
  });
});
