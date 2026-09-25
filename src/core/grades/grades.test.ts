import { describe, expect, it } from "vitest";
import type { GradeCounts } from "../schema";
import {
  formatGpa,
  formatRating,
  formatShare,
  gradeBars,
  gradeSentence,
  gradeSummary,
} from "./grades";

//                        A+  A  A-  B+  B  B-  C+  C  C-  D+  D  D-  F  W  Other
const counts: GradeCounts = [5, 20, 10, 8, 12, 9, 6, 10, 4, 2, 3, 1, 10, 7, 3];

describe("grade summary", () => {
  it("averages GPA over A+ to F only, like PlanetTerp", () => {
    const s = gradeSummary(counts);
    const graded = 100;
    const points =
      5 * 4 +
      20 * 4 +
      10 * 3.7 +
      8 * 3.3 +
      12 * 3 +
      9 * 2.7 +
      6 * 2.3 +
      10 * 2 +
      4 * 1.7 +
      2 * 1.3 +
      3 * 1 +
      1 * 0.7;
    expect(s.students).toBe(110);
    expect(s.graded).toBe(graded);
    expect(s.averageGpa).toBeCloseTo(points / graded, 10);
    expect(s.aOrBShare).toBeCloseTo(64 / 100, 10);
  });

  it("reads as a sentence", () => {
    expect(gradeSentence(gradeSummary(counts))).toBe(
      "64% got an A or B · average GPA 2.71",
    );
    expect(formatGpa(3)).toBe("3.00");
    expect(formatShare(0.645)).toBe("65%");
  });

  it("has nothing to say without letter grades", () => {
    const onlyW: GradeCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 1];
    const s = gradeSummary(onlyW);
    expect(s).toEqual({
      students: 5,
      graded: 0,
      averageGpa: null,
      aOrBShare: null,
    });
    expect(gradeSentence(s)).toBeNull();
  });
});

describe("grade bars", () => {
  it("has A, B, C, D, F, W and Other, letters split +/plain/−", () => {
    const bars = gradeBars(counts);
    expect(bars.map((b) => [b.letter, b.count])).toEqual([
      ["A", 35],
      ["B", 29],
      ["C", 20],
      ["D", 6],
      ["F", 10],
      ["W", 7],
      ["Other", 3],
    ]);
    expect(bars[0]?.segments.map((s) => [s.key, s.modifier, s.count])).toEqual([
      ["A+", "+", 5],
      ["A", "", 20],
      ["A-", "−", 10],
    ]);
    expect(bars[0]?.share).toBeCloseTo(35 / 110);
    expect(bars[4]?.segments).toHaveLength(1);
    expect(bars.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1);
  });

  it("is all zeros for an empty record", () => {
    const empty = new Array(15).fill(0) as unknown as GradeCounts;
    expect(gradeBars(empty).every((b) => b.share === 0)).toBe(true);
  });
});

describe("ratings", () => {
  it("formats rating and review count", () => {
    expect(formatRating(4.234, 38)).toEqual({
      rating: "4.2",
      reviews: "38 reviews",
    });
    expect(formatRating(5, 1)).toEqual({ rating: "5.0", reviews: "1 review" });
    expect(formatRating(null, 0)).toEqual({
      rating: null,
      reviews: "No reviews",
    });
  });
});
