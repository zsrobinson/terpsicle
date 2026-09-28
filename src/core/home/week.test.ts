import { describe, expect, it } from "vitest";
import {
  anOwnTask,
  anUnpublishedCalendar,
  aPlan,
  aPlanCourse,
  aPublishedCalendar,
  aSectionSnapshot,
  aTimedMeeting,
  aTodoItem,
} from "~/fixtures";
import { DEFAULT_TRAVEL_SETTINGS, type TodoItem } from "../schema";
import { EMPTY_CAMPUS } from "../travel/campus";
import { nextClassDay } from "./today";
import {
  COMING_UP_DAYS,
  comingUp,
  laterDayWords,
  startsInWords,
  termWeek,
  weekByClass,
  weekOf,
  weekTotals,
} from "./week";

// Home's week (docs/V3.md §1.5): Todo's items a class at a time, what's
// after the week, the term's week number and the next class's words.

/** Files an item under its code, else its ELMS name, as Todo does. */
const byCode = (item: TodoItem) => ({
  key: item.courseCode ?? item.courseLabel ?? "Other",
  code: item.courseCode,
  label: item.courseLabel,
});

const due = (
  uid: string,
  courseCode: string | null,
  dueDate: string,
  dueAt: string | null = null,
) => aTodoItem({ uid, courseCode, dueDate, dueAt, title: uid });

// Monday 2026-09-28 starts the week; Sunday 2026-10-04 ends it.
const WEEK = { from: "2026-09-28", to: "2026-10-04" };

describe("weekOf", () => {
  it("is Todo's week: Monday to Sunday, or from Sunday when set", () => {
    expect(weekOf("2026-10-01", "monday")).toEqual(WEEK);
    expect(weekOf("2026-10-04", "monday")).toEqual(WEEK);
    expect(weekOf("2026-10-01", "sunday")).toEqual({
      from: "2026-09-27",
      to: "2026-10-03",
    });
  });
});

describe("weekByClass", () => {
  const items = [
    due("hw4", "MATH240", "2026-10-02"),
    due("hw3", "MATH240", "2026-09-28"),
    due("proj2", "CMSC216", "2026-09-29", "2026-09-30T03:59:00.000Z"),
    due("quiz", "CMSC216", "2026-09-29", "2026-09-29T17:00:00.000Z"),
    due("essay", "ENGL101", "2026-09-30"),
    // Last week and next week: not this week's.
    due("old", "CMSC216", "2026-09-27"),
    due("later", "ENGL101", "2026-10-05"),
    anOwnTask({ uid: "no-date" }),
  ];

  it("tallies each class's week and lists what's open, soonest first", () => {
    const rows = weekByClass(items, new Set(["hw3", "essay"]), WEEK, byCode);
    expect(
      rows.map((r) => [r.key, r.done, r.total, r.open.map((i) => i.uid)]),
    ).toEqual([
      ["CMSC216", 0, 2, ["quiz", "proj2"]],
      ["MATH240", 1, 2, ["hw4"]],
      // All done: last.
      ["ENGL101", 1, 1, []],
    ]);
  });

  it("puts the class whose next item is soonest first, and done classes by name", () => {
    const rows = weekByClass(
      items,
      new Set(["quiz", "proj2", "essay"]),
      WEEK,
      byCode,
    );
    expect(rows.map((r) => r.key)).toEqual(["MATH240", "CMSC216", "ENGL101"]);
  });

  it("files items with no code under their ELMS course name", () => {
    const rows = weekByClass(
      [
        aTodoItem({
          uid: "club",
          courseCode: null,
          courseLabel: "Robotics Club",
          dueDate: "2026-09-30",
        }),
      ],
      new Set(),
      WEEK,
      byCode,
    );
    expect(rows).toMatchObject([
      { key: "Robotics Club", code: null, label: "Robotics Club", total: 1 },
    ]);
  });

  it("counts the week across classes", () => {
    const rows = weekByClass(items, new Set(["hw3", "essay"]), WEEK, byCode);
    expect(weekTotals(rows)).toEqual({ done: 2, total: 5 });
    expect(weekTotals([])).toEqual({ done: 0, total: 0 });
  });
});

describe("comingUp", () => {
  const items = [
    due("this-week", "CMSC216", "2026-10-04"),
    due("midterm", "CMSC216", "2026-10-08"),
    due("hw5", "MATH240", "2026-10-06"),
    due("done", "MATH240", "2026-10-07"),
    due("far", "ENGL101", "2026-10-30"),
  ];

  it("lists open items after the week, within three weeks, soonest first", () => {
    expect(
      comingUp(items, new Set(["done"]), WEEK.to).map((i) => i.uid),
    ).toEqual(["hw5", "midterm"]);
  });

  it("stops at the edge of the window, and at the most it shows", () => {
    const edge = due("edge", "ENGL101", "2026-10-25");
    expect(COMING_UP_DAYS).toBe(21);
    expect(comingUp([edge], new Set(), WEEK.to).map((i) => i.uid)).toEqual([
      "edge",
    ]);
    expect(comingUp(items, new Set(), WEEK.to, 1).map((i) => i.uid)).toEqual([
      "hw5",
    ]);
  });
});

describe("termWeek", () => {
  // Spring 2027's classes start Wednesday Jan 27 and end May 11.
  const calendars = [aPublishedCalendar()];

  it("counts weeks from the Monday of the week classes start", () => {
    expect(termWeek("2027-01-27", "202701", calendars)).toBe(1);
    expect(termWeek("2027-01-31", "202701", calendars)).toBe(1);
    expect(termWeek("2027-02-01", "202701", calendars)).toBe(2);
    expect(termWeek("2027-05-11", "202701", calendars)).toBe(16);
  });

  it("is null outside the classes, or without a published calendar", () => {
    expect(termWeek("2027-01-26", "202701", calendars)).toBeNull();
    expect(termWeek("2027-05-12", "202701", calendars)).toBeNull();
    expect(termWeek("2027-02-01", "202701", [])).toBeNull();
    expect(
      termWeek("2027-02-01", "202701", [
        anUnpublishedCalendar({ termId: "202701" }),
      ]),
    ).toBeNull();
  });
});

describe("startsInWords", () => {
  it("says how long until a class, up to three hours", () => {
    expect(startsInWords(600, 595)).toBe("in 5 min");
    expect(startsInWords(600, 560)).toBe("in 40 min");
    expect(startsInWords(600, 520)).toBe("in 1 hr 20 min");
    expect(startsInWords(600, 480)).toBe("in 2 hr");
    expect(startsInWords(600, 420)).toBe("in 3 hr");
  });

  it("says nothing once it's started, or when it's hours away", () => {
    expect(startsInWords(600, 600)).toBeNull();
    expect(startsInWords(600, 610)).toBeNull();
    expect(startsInWords(600, 419)).toBeNull();
  });
});

describe("laterDayWords", () => {
  it("names tomorrow, and any later day by its weekday", () => {
    expect(laterDayWords("2026-09-29", "2026-09-28")).toBe("Tomorrow");
    expect(laterDayWords("2026-10-05", "2026-10-02")).toBe("Monday");
  });
});

describe("nextClassDay", () => {
  const plan = aPlan({
    courses: [
      aPlanCourse({
        courseCode: "CMSC351",
        sectionCode: "0101",
        snapshot: aSectionSnapshot({
          meetings: [aTimedMeeting({ days: ["M", "W"], start: 600, end: 650 })],
        }),
      }),
    ],
  });
  const travel = DEFAULT_TRAVEL_SETTINGS;

  it("finds the next day with classes: tomorrow, or after a weekend", () => {
    // Tuesday Feb 2, 2027 → Wednesday; Wednesday Feb 3 → Monday Feb 8.
    expect(
      nextClassDay(
        plan,
        "2027-02-02",
        aPublishedCalendar(),
        travel,
        EMPTY_CAMPUS,
      )?.date,
    ).toBe("2027-02-03");
    const monday = nextClassDay(
      plan,
      "2027-02-03",
      aPublishedCalendar(),
      travel,
      EMPTY_CAMPUS,
    );
    expect(monday?.date).toBe("2027-02-08");
    expect(monday?.classes.map((c) => c.courseCode)).toEqual(["CMSC351"]);
  });

  it("skips a break, and gives up after a week", () => {
    // Spring Break is Mar 14–21: from Friday Mar 12, the next class is Mar 22.
    expect(
      nextClassDay(
        plan,
        "2027-03-12",
        aPublishedCalendar(),
        travel,
        EMPTY_CAMPUS,
      ),
    ).toBeNull();
    expect(
      nextClassDay(
        plan,
        "2027-03-15",
        aPublishedCalendar(),
        travel,
        EMPTY_CAMPUS,
      )?.date,
    ).toBe("2027-03-22");
  });
});
