import { describe, expect, it } from "vitest";
import { moveFocus, type NavItem, tabStop } from "./keyboard";

// A week like the demo plan's: Monday has two classes and a pill between
// them, Tuesday is empty, Wednesday has an early and a late class, and
// Friday has two things side by side at 10am.
const WEEK: NavItem[] = [
  { key: "mon-stat", col: 0, start: 600 },
  { key: "mon-pill", col: 0, start: 655 },
  { key: "mon-cmsc", col: 0, start: 660 },
  { key: "wed-early", col: 2, start: 480 },
  { key: "wed-late", col: 2, start: 900 },
  { key: "fri-right", col: 4, start: 600, lane: 1 },
  { key: "fri-left", col: 4, start: 600, lane: 0 },
];

describe("moveFocus", () => {
  it("goes through a day in time order with ↑ and ↓, and stops at its ends", () => {
    expect(moveFocus(WEEK, "mon-stat", "down")).toBe("mon-pill");
    expect(moveFocus(WEEK, "mon-pill", "down")).toBe("mon-cmsc");
    expect(moveFocus(WEEK, "mon-cmsc", "down")).toBeNull();
    expect(moveFocus(WEEK, "mon-cmsc", "up")).toBe("mon-pill");
    expect(moveFocus(WEEK, "mon-stat", "up")).toBeNull();
  });

  it("reads things that start together left to right", () => {
    expect(moveFocus(WEEK, "fri-left", "down")).toBe("fri-right");
    expect(moveFocus(WEEK, "fri-right", "up")).toBe("fri-left");
  });

  it("jumps to the day's first and last with Home and End", () => {
    expect(moveFocus(WEEK, "mon-pill", "home")).toBe("mon-stat");
    expect(moveFocus(WEEK, "mon-pill", "end")).toBe("mon-cmsc");
    expect(moveFocus(WEEK, "mon-stat", "home")).toBeNull();
    expect(moveFocus(WEEK, "mon-cmsc", "end")).toBeNull();
  });

  it("goes to the nearest thing in time on the next day that has anything", () => {
    // Tuesday is empty, so → from Monday skips to Wednesday.
    expect(moveFocus(WEEK, "mon-stat", "right")).toBe("wed-early");
    expect(moveFocus(WEEK, "mon-cmsc", "right")).toBe("wed-early");
    expect(moveFocus(WEEK, "wed-late", "right")).toBe("fri-left");
    expect(moveFocus(WEEK, "wed-late", "left")).toBe("mon-cmsc");
    expect(moveFocus(WEEK, "fri-left", "left")).toBe("wed-early");
  });

  it("stops at the ends of the week", () => {
    expect(moveFocus(WEEK, "mon-stat", "left")).toBeNull();
    expect(moveFocus(WEEK, "fri-left", "right")).toBeNull();
  });

  it("does nothing for an item that's gone", () => {
    expect(moveFocus(WEEK, "gone", "down")).toBeNull();
  });
});

describe("tabStop", () => {
  it("is the last item focused, while it's still there", () => {
    expect(tabStop(WEEK, "wed-late")).toBe("wed-late");
    expect(tabStop(WEEK, "gone")).toBe("mon-stat");
  });

  it("is the open course's first class when there's nothing to remember", () => {
    expect(tabStop(WEEK, null, ["wed-late", "mon-cmsc"])).toBe("mon-cmsc");
  });

  it("is the open course's class nearest where focus was, once that's gone", () => {
    // A ghost on Wednesday afternoon was switched to: it's now a class.
    const near = { col: 2, start: 840 };
    expect(tabStop(WEEK, "gone", ["mon-cmsc", "wed-late"], near)).toBe(
      "wed-late",
    );
    expect(
      tabStop(WEEK, "gone", ["mon-cmsc", "wed-early", "wed-late"], near),
    ).toBe("wed-late");
  });

  it("is the week's first item otherwise, and nothing on an empty week", () => {
    expect(tabStop(WEEK, null)).toBe("mon-stat");
    expect(tabStop([], null)).toBeNull();
  });
});
