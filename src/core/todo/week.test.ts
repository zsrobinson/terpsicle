import { describe, expect, it } from "vitest";
import { aTodoItem } from "~/fixtures";
import { courseKey, isHiddenItem, relativeDue } from "./list";

// Hiding a course, and "Due in 3 hours" (docs/V3.md §3.11). 2026-09-29 is a
// Tuesday. New York is on daylight time (UTC−4).
const TODAY = "2026-09-29";

const item = (uid: string, dueDate: string, extra = {}) =>
  aTodoItem({ uid, dueDate, dueAt: null, title: uid, ...extra });
describe("hiding a course", () => {
  const club = item("club", TODAY, {
    courseLabel: "Terps Robotics Club",
    courseCode: null,
  });
  const crossListed = item("x", TODAY, {
    courseLabel: "CMSC216/ENEE222-0101: Computer Systems",
    courseCode: "CMSC216",
  });

  it("keys a group by its code, else its ELMS name, else Other", () => {
    expect(courseKey(item("a", TODAY), new Set())).toBe("CMSC216");
    expect(courseKey(club, new Set())).toBe("Terps Robotics Club");
    expect(courseKey({ courseLabel: null, courseCode: null }, new Set())).toBe(
      "Other",
    );
  });

  it("hides by the group's key, or any code the item carries", () => {
    const none = new Set<string>();
    expect(isHiddenItem(club, new Set(["Terps Robotics Club"]), none)).toBe(
      true,
    );
    expect(isHiddenItem(club, new Set(["CMSC216"]), none)).toBe(false);
    // Filed under ENEE222 (it's in the plan), hidden as CMSC216: still hidden.
    expect(
      isHiddenItem(crossListed, new Set(["CMSC216"]), new Set(["ENEE222"])),
    ).toBe(true);
    expect(isHiddenItem(crossListed, new Set(["ENEE222"]), none)).toBe(true);
    expect(isHiddenItem(crossListed, none, none)).toBe(false);
  });
});

describe("relativeDue", () => {
  // 11:59pm on Tuesday in New York.
  const due = item("p", TODAY, { dueAt: "2026-09-30T03:59:00.000Z" });
  const at = (iso: string) => Date.parse(iso);

  it("counts down to a time today, never saying there's more time than there is", () => {
    expect(relativeDue(due, at("2026-09-30T00:59:00.000Z"), TODAY)).toBe(
      "Due in 3 hours",
    );
    expect(relativeDue(due, at("2026-09-30T00:59:30.000Z"), TODAY)).toBe(
      "Due in 2 hours",
    );
    expect(relativeDue(due, at("2026-09-30T02:59:00.000Z"), TODAY)).toBe(
      "Due in 1 hour",
    );
    expect(relativeDue(due, at("2026-09-30T03:34:00.000Z"), TODAY)).toBe(
      "Due in 25 minutes",
    );
    expect(relativeDue(due, at("2026-09-30T03:58:00.000Z"), TODAY)).toBe(
      "Due in 1 minute",
    );
    expect(relativeDue(due, at("2026-09-30T03:59:20.000Z"), TODAY)).toBe(
      "Due now",
    );
  });

  it("says how long ago, once it's passed", () => {
    const morning = item("m", TODAY, { dueAt: "2026-09-29T13:00:00.000Z" });
    expect(relativeDue(morning, at("2026-09-29T15:10:00.000Z"), TODAY)).toBe(
      "Due 2 hours ago",
    );
    expect(relativeDue(morning, at("2026-09-29T13:05:00.000Z"), TODAY)).toBe(
      "Due 5 minutes ago",
    );
  });

  it("leaves other days and all-day items to their clock time", () => {
    const now = at("2026-09-29T16:00:00.000Z");
    expect(relativeDue(item("tomorrow", "2026-09-30"), now, TODAY)).toBeNull();
    expect(
      relativeDue(
        item("tomorrow-at", "2026-09-30", {
          dueAt: "2026-09-30T17:00:00.000Z",
        }),
        now,
        TODAY,
      ),
    ).toBeNull();
    expect(relativeDue(item("all-day", TODAY), now, TODAY)).toBeNull();
  });
});
