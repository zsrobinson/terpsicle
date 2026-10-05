import { describe, expect, it } from "vitest";
import { anOwnTask, aTodoItem } from "~/fixtures";
import { courseKey, itemCourse } from "./list";
import {
  courseWeek,
  finishesCourseWeek,
  isThisWeek,
  isWeekend,
  shiftWeek,
  shortDayLabel,
  totalOf,
  weekDates,
  weekdayShort,
  weekSpan,
  weekStartOf,
  weekTitle,
} from "./weeks";

// Todo's week. 2026-09-29 is a Tuesday.
const TODAY = "2026-09-29";

describe("weeks", () => {
  it("start on Monday, so Sunday night ends the week", () => {
    expect(weekStartOf(TODAY)).toBe("2026-09-28");
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28");
    expect(weekDates("2026-09-28").map(weekdayShort)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("start on Sunday only where a caller asks (Home's week)", () => {
    expect(weekStartOf(TODAY, "sunday")).toBe("2026-09-27");
  });

  it("list their seven dates across a month's end", () => {
    expect(weekDates("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("know their weekend", () => {
    expect(weekDates("2026-09-28").map(isWeekend)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it("span Monday to Sunday, and move a week at a time", () => {
    expect(weekSpan(TODAY)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(shiftWeek(TODAY, 1)).toBe("2026-10-05");
    expect(shiftWeek("2026-10-04", -1)).toBe("2026-09-21");
  });

  it("know when they already show today", () => {
    expect(isThisWeek("2026-10-04", TODAY)).toBe(true);
    expect(isThisWeek("2026-10-05", TODAY)).toBe(false);
  });

  it("are titled by their dates", () => {
    expect(weekTitle("2026-09-28", TODAY)).toBe("Sep 28 – Oct 4");
    expect(weekTitle("2026-12-28", TODAY)).toBe("Dec 28 – Jan 3, 2027");
    expect(shortDayLabel("2026-10-02")).toBe("Fri, Oct 2");
  });
});

describe("courseWeek", () => {
  const planCourses = new Set<string>();
  const course = (item: Parameters<typeof itemCourse>[0]) => ({
    key: courseKey(item, planCourses),
    code: itemCourse(item, planCourses),
    label: item.courseLabel,
  });
  const due = (uid: string, dueDate: string, extra = {}) =>
    aTodoItem({ uid, dueDate, dueAt: null, title: uid, ...extra });
  const math = {
    courseLabel: "MATH240-0201: Linear Algebra",
    courseCode: "MATH240",
  };

  it("tallies each course's done and due in the week, Monday to Sunday night", () => {
    const items = [
      due("before", "2026-09-27"), // the Sunday before
      due("mon-done", "2026-09-28"),
      due("sun", "2026-10-04"), // Sunday night ends the week
      due("next", "2026-10-05"), // after
      due("math", "2026-10-01", math),
      anOwnTask({ uid: "own-nodate-00000", courseCode: "MATH240" }),
    ];
    const rows = courseWeek(
      items,
      new Set(["mon-done", "before"]),
      "2026-09-28",
      course,
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: "CMSC216", done: 1, total: 2 }),
      expect.objectContaining({ key: "MATH240", done: 0, total: 1 }),
    ]);
    expect(totalOf(rows)).toEqual({ done: 1, total: 3 });
  });

  it("puts courses before ELMS names, and no course last", () => {
    const rows = courseWeek(
      [
        due("none", TODAY, { courseLabel: null, courseCode: null }),
        due("club", TODAY, { courseLabel: "Robotics Club", courseCode: null }),
        due("math", TODAY, math),
      ],
      new Set(),
      "2026-09-28",
      course,
    );
    expect(rows.map((r) => r.key)).toEqual([
      "MATH240",
      "Robotics Club",
      "Other",
    ]);
  });
});

describe("finishesCourseWeek", () => {
  const first = "2026-09-28";
  const item = aTodoItem({ uid: "lab", dueDate: "2026-10-01" });

  it("is true for the last thing left in its course's week", () => {
    expect(
      finishesCourseWeek(item, new Set(), first, { done: 2, total: 3 }),
    ).toBe(true);
  });

  it("is false with more than one left, or once it's done", () => {
    expect(
      finishesCourseWeek(item, new Set(), first, { done: 1, total: 3 }),
    ).toBe(false);
    expect(
      finishesCourseWeek(item, new Set(["lab"]), first, {
        done: 3,
        total: 3,
      }),
    ).toBe(false);
  });

  it("is false for anything outside the week, or with no date", () => {
    const row = { done: 2, total: 3 };
    for (const dueDate of ["2026-09-27", "2026-10-05", null])
      expect(
        finishesCourseWeek({ ...item, dueDate }, new Set(), first, row),
      ).toBe(false);
    // Sunday night is still the week.
    expect(
      finishesCourseWeek(
        { ...item, dueDate: "2026-10-04" },
        new Set(),
        first,
        row,
      ),
    ).toBe(true);
  });

  it("is false for a course with no row (hidden)", () => {
    expect(finishesCourseWeek(item, new Set(), first, undefined)).toBe(false);
  });
});
