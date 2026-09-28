import { describe, expect, it } from "vitest";
import {
  CREDITS,
  clock,
  clockRange,
  layOut,
  placedSection,
  problemsOf,
  problemWords,
  START,
  walksOf,
  weekEntries,
} from "./plan-a";

describe("Plan A, the marketing page's sample", () => {
  it("starts as the mock app's demo plan: 16 credits and three problems", () => {
    expect(CREDITS).toBe(16);
    expect(problemsOf(START).map((p) => p.id)).toEqual([
      "overlap",
      "tight-connection",
      "full",
    ]);
    expect(problemWords(3)).toBe("3 problems");
    expect(problemWords(1)).toBe("1 problem");
  });

  it("draws ENGL393 0101 beside CMSC330 on Tuesday and Thursday", () => {
    const tue = weekEntries(START).filter(
      (e) => e.day === 1 && e.start === 570,
    );
    expect(tue.map((e) => [e.course.code, e.lane, e.lanes])).toEqual([
      ["CMSC330", 0, 2],
      ["ENGL393", 1, 2],
    ]);
  });

  it("fixes the overlap by switching ENGL393 to 0205, which fits", () => {
    const fixed = { ...START, ENGL393: "0205" as const };
    expect(placedSection(fixed, "ENGL393").code).toBe("0205");
    expect(problemsOf(fixed).map((p) => p.id)).not.toContain("overlap");
    // Every class has its column to itself again.
    expect(weekEntries(fixed).every((e) => e.lanes === 1)).toBe(true);
  });

  it("keeps a block's id when its course switches sections, so it moves", () => {
    const ids = (s: typeof START) =>
      weekEntries(s)
        .filter((e) => e.course.code === "ENGL393")
        .map((e) => e.id);
    expect(ids({ ...START, ENGL393: "0205" })).toEqual(ids(START));
  });

  it("flags the 8 minute walk until STAT400 moves to 0201", () => {
    expect(walksOf(START).map((w) => [w.day, w.minutes])).toEqual([
      [0, 8],
      [2, 8],
      [4, 8],
    ]);
    const moved = { ...START, STAT400: "0201" as const };
    expect(walksOf(moved)).toEqual([]);
    expect(problemsOf(moved).map((p) => p.id)).toEqual(["overlap", "full"]);
  });

  it("keeps the full section on the list while it's watched: a watch isn't a fix", () => {
    const watching = { ...START, watching: true };
    expect(problemsOf(watching).at(-1)).toMatchObject({
      id: "full",
      title: "CMSC351 0301 is full",
      fix: { kind: "watch" },
    });
  });

  it("offers each fix in the scheduler's words", () => {
    expect(
      problemsOf(START).map((p) =>
        p.fix.kind === "switch" ? p.fix.label : "watch",
      ),
    ).toEqual(["Switch ENGL393 to 0205", "Switch STAT400 to 0201", "watch"]);
    expect(problemsOf(START)[1]?.detail).toBe(
      "8 min to get there, 10 min between classes · Monday, Wednesday, Friday",
    );
  });

  it("lays out three overlapping classes in three lanes, and a later one alone", () => {
    const laid = layOut([
      { day: 0, start: 600, end: 700 },
      { day: 0, start: 630, end: 660 },
      { day: 0, start: 650, end: 720 },
      { day: 0, start: 800, end: 850 },
    ]);
    expect(laid.map((e) => [e.lane, e.lanes])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [0, 1],
    ]);
  });

  it("reads the clock as the calendar does", () => {
    expect(clock(570)).toBe("9:30am");
    expect(clock(720)).toBe("12pm");
    expect(clockRange(600, 650)).toBe("10–10:50am");
    expect(clockRange(570, 645)).toBe("9:30–10:45am");
    expect(clockRange(690, 780)).toBe("11:30am–1pm");
  });
});
