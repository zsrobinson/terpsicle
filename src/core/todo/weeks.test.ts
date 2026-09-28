import { describe, expect, it } from "vitest";
import { anOwnTask, aTodoItem } from "~/fixtures";
import { courseKey, itemCourse } from "./list";
import {
  addMonths,
  courseWeeks,
  isCurrentPeriod,
  mergeRange,
  monthTitle,
  monthWeeks,
  rangeLoaded,
  rangeToLoad,
  shiftAnchor,
  shortDayLabel,
  totalOf,
  viewSpan,
  weekDates,
  weekdayNames,
  weekStartOf,
  weekTitle,
} from "./weeks";

// Todo's calendar. 2026-09-29 is a Tuesday; October 2026 starts on a
// Thursday and ends on a Saturday.
const TODAY = "2026-09-29";

describe("weeks", () => {
  it("start on Monday, so Sunday night ends the week", () => {
    expect(weekStartOf(TODAY, "monday")).toBe("2026-09-28");
    expect(weekStartOf("2026-10-04", "monday")).toBe("2026-09-28"); // Sunday
    expect(weekStartOf("2026-09-28", "monday")).toBe("2026-09-28");
    expect(weekdayNames("monday")).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
  });

  it("start on Sunday when the person sets it", () => {
    expect(weekStartOf(TODAY, "sunday")).toBe("2026-09-27");
    expect(weekStartOf("2026-10-04", "sunday")).toBe("2026-10-04");
    expect(weekdayNames("sunday")[0]).toBe("Sun");
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
});

describe("months", () => {
  it("step across years", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
    expect(addMonths("2026-10-01", 0)).toBe("2026-10-01");
  });

  it("run whole weeks from the 1st's to the last day's", () => {
    const monday = monthWeeks("2026-10-14", "monday");
    expect(monday).toHaveLength(5);
    expect(monday[0]?.[0]).toBe("2026-09-28");
    expect(monday.at(-1)?.[6]).toBe("2026-11-01");
    const sunday = monthWeeks("2026-10-14", "sunday");
    expect(sunday[0]?.[0]).toBe("2026-09-27");
    expect(sunday.at(-1)?.[6]).toBe("2026-10-31");
    // A month that needs six rows: August 2026 starts on a Saturday.
    expect(monthWeeks("2026-08-10", "monday")).toHaveLength(6);
  });
});

describe("views", () => {
  it("span a week or the month's grid", () => {
    expect(viewSpan("week", TODAY, "monday")).toEqual({
      from: "2026-09-28",
      to: "2026-10-04",
    });
    expect(viewSpan("month", "2026-10-20", "monday")).toEqual({
      from: "2026-09-28",
      to: "2026-11-01",
    });
  });

  it("move a week or a month at a time", () => {
    expect(shiftAnchor("week", TODAY, 1, "monday")).toBe("2026-10-05");
    expect(shiftAnchor("week", TODAY, -1, "sunday")).toBe("2026-09-20");
    expect(shiftAnchor("month", TODAY, 1, "monday")).toBe("2026-10-01");
    expect(shiftAnchor("month", "2026-01-15", -1, "monday")).toBe("2025-12-01");
  });

  it("know when they already show today", () => {
    expect(isCurrentPeriod("week", "2026-10-04", TODAY, "monday")).toBe(true);
    expect(isCurrentPeriod("week", "2026-10-04", TODAY, "sunday")).toBe(false);
    expect(isCurrentPeriod("month", "2026-09-01", TODAY, "monday")).toBe(true);
    expect(isCurrentPeriod("month", "2026-10-01", TODAY, "monday")).toBe(false);
  });

  it("are titled by their dates", () => {
    expect(weekTitle("2026-09-28", TODAY)).toBe("Sep 28 – Oct 4");
    expect(weekTitle("2026-12-28", TODAY)).toBe("Dec 28 – Jan 3, 2027");
    expect(monthTitle("2026-10-14")).toBe("October 2026");
    expect(shortDayLabel("2026-10-02")).toBe("Fri, Oct 2");
  });
});

describe("courseWeeks", () => {
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

  it("tallies each course's done and due, week by week, ending with the week shown", () => {
    const items = [
      due("old", "2026-09-06"), // before the four weeks
      due("w1", "2026-09-14"),
      due("w3-done", "2026-09-27"), // Sunday night ends week 3
      due("w4-done", "2026-09-28"),
      due("w4", "2026-10-04"),
      due("next", "2026-10-05"), // after
      due("math-w4", "2026-10-01", math),
      anOwnTask({ uid: "own-nodate-00000", courseCode: "MATH240" }),
    ];
    const rows = courseWeeks(
      items,
      new Set(["w3-done", "w4-done", "old"]),
      "2026-09-28",
      4,
      course,
    );
    expect(rows.map((r) => r.key)).toEqual(["CMSC216", "MATH240"]);
    expect(rows[0]?.weeks).toEqual([
      { week: "2026-09-07", done: 0, total: 0 },
      { week: "2026-09-14", done: 0, total: 1 },
      { week: "2026-09-21", done: 1, total: 1 },
      { week: "2026-09-28", done: 1, total: 2 },
    ]);
    expect(rows[1]?.weeks.at(-1)).toEqual({
      week: "2026-09-28",
      done: 0,
      total: 1,
    });
    expect(totalOf(rows, 3)).toEqual({ done: 1, total: 3 });
  });

  it("puts courses before ELMS names, and no course last", () => {
    const rows = courseWeeks(
      [
        due("none", TODAY, { courseLabel: null, courseCode: null }),
        due("club", TODAY, { courseLabel: "Robotics Club", courseCode: null }),
        due("math", TODAY, math),
      ],
      new Set(),
      "2026-09-28",
      1,
      course,
    );
    expect(rows.map((r) => r.key)).toEqual([
      "MATH240",
      "Robotics Club",
      "Other",
    ]);
  });
});

describe("loading more of the calendar", () => {
  const due = (uid: string, dueDate: string | null) =>
    dueDate === null
      ? anOwnTask({ uid })
      : aTodoItem({ uid, dueDate, dueAt: null });

  it("knows what's loaded", () => {
    const loaded = [{ from: "2026-09-01", to: "2026-12-29" }];
    expect(rangeLoaded(loaded, { from: "2026-09-28", to: "2026-10-04" })).toBe(
      true,
    );
    expect(rangeLoaded(loaded, { from: "2026-12-28", to: "2027-01-03" })).toBe(
      false,
    );
  });

  it("asks from four weeks back, as far ahead as one call goes", () => {
    expect(rangeToLoad({ from: "2027-01-04", to: "2027-01-10" }, 119)).toEqual({
      from: "2026-12-07",
      to: "2027-04-05",
    });
  });

  it("keeps what's outside the new range and takes the answer inside it", () => {
    const merged = mergeRange(
      {
        items: [
          due("old", "2026-09-10"),
          due("moved", "2026-12-20"),
          due("own-undated-0000", null),
        ],
        done: new Set(["old", "moved"]),
      },
      { from: "2026-12-07", to: "2027-04-05" },
      {
        items: [due("new", "2027-01-05"), due("own-undated-0000", null)],
        done: ["new"],
      },
    );
    expect(merged.items.map((i) => i.uid)).toEqual([
      "old",
      "new",
      "own-undated-0000",
    ]);
    expect([...merged.done].sort()).toEqual(["new", "old"]);
  });
});
