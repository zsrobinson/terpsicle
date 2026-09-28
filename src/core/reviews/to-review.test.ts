import { describe, expect, it } from "vitest";
import { aPlan, aPlanCourse, aSavedCourse, aSectionSnapshot } from "~/fixtures";
import {
  instructorsToReview,
  isReviewableTerm,
  reviewedKey,
} from "./to-review";

const placed = (courseCode: string, ...instructors: string[]) =>
  aPlanCourse({
    courseCode,
    sectionCode: "0101",
    snapshot: aSectionSnapshot({ instructors }),
  });

describe("isReviewableTerm", () => {
  it("is a term that's over, or in its last six weeks", () => {
    expect(isReviewableTerm("202601", "2026-09-28")).toBe(true);
    expect(isReviewableTerm("202608", "2026-09-28")).toBe(false);
    expect(isReviewableTerm("202608", "2026-11-25")).toBe(true);
    expect(isReviewableTerm("202701", "2026-09-28")).toBe(false);
  });
});

describe("instructorsToReview", () => {
  const today = "2026-09-28";

  it("names each instructor of the sections you placed, newest term first", () => {
    const plans = [
      aPlan({
        termId: "202601",
        courses: [placed("CMSC351", "Clyde Kruskal"), aSavedCourse("MATH240")],
      }),
      aPlan({
        id: "plan_fall",
        termId: "202508",
        courses: [placed("CMSC250", "Ada Brandt", "Staff")],
      }),
    ];
    expect(instructorsToReview(plans, today)).toEqual([
      { termId: "202601", course: "CMSC351", name: "Clyde Kruskal" },
      { termId: "202508", course: "CMSC250", name: "Ada Brandt" },
    ]);
  });

  it("reads a term's schedule from its main plan, not the one changed last", () => {
    const plans = [
      aPlan({
        id: "plan_a",
        termId: "202601",
        order: 0,
        updatedAt: "2026-01-02T00:00:00.000Z",
        courses: [placed("CMSC351", "Clyde Kruskal")],
      }),
      aPlan({
        id: "plan_b",
        termId: "202601",
        order: 1,
        updatedAt: "2026-01-20T00:00:00.000Z",
        courses: [placed("CMSC351", "A Draft")],
      }),
    ];
    // The one you chose as main.
    expect(
      instructorsToReview(plans, today, new Set(), { "202601": "plan_b" }).map(
        (r) => r.name,
      ),
    ).toEqual(["A Draft"]);
    // None chosen: the first tab is main, however recently a draft changed.
    expect(instructorsToReview(plans, today).map((r) => r.name)).toEqual([
      "Clyde Kruskal",
    ]);
  });

  it("leaves out terms still going, and what you've reviewed", () => {
    const plans = [
      aPlan({ termId: "202608", courses: [placed("CMSC330", "Now Teaching")] }),
      aPlan({
        id: "plan_spring",
        termId: "202601",
        courses: [placed("CMSC351", "Clyde Kruskal", "Ada Brandt")],
      }),
    ];
    const reviewed = new Set([reviewedKey("CMSC351", "clyde  KRUSKAL")]);
    expect(instructorsToReview(plans, today, reviewed)).toEqual([
      { termId: "202601", course: "CMSC351", name: "Ada Brandt" },
    ]);
  });
});
