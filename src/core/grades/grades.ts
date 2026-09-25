import {
  GRADE_KEYS,
  GRADE_POINTS,
  type GradeCounts,
  type GradeKey,
} from "../schema";

// Grade summaries and PlanetTerp-style bars (SPEC §3.4, DATA §4.1). Average
// GPA and "% A or B" count A+ through F only; W and Other are excluded,
// matching PlanetTerp.

function count(counts: GradeCounts, key: GradeKey): number {
  return counts[GRADE_KEYS.indexOf(key)] ?? 0;
}

export type GradeSummary = {
  /** Everyone in the data, W and Other included. */
  readonly students: number;
  /** A+ through F. */
  readonly graded: number;
  /** null when nobody got a letter grade. */
  readonly averageGpa: number | null;
  /** (A+ … B−) ÷ (A+ … F), 0–1; null when nobody got a letter grade. */
  readonly aOrBShare: number | null;
};

export function gradeSummary(counts: GradeCounts): GradeSummary {
  let students = 0;
  let graded = 0;
  let points = 0;
  let aOrB = 0;
  GRADE_KEYS.forEach((key, i) => {
    const n = counts[i] ?? 0;
    students += n;
    const gp = GRADE_POINTS[key];
    if (gp === null) return;
    graded += n;
    points += gp * n;
    if (key.startsWith("A") || key.startsWith("B")) aOrB += n;
  });
  return {
    students,
    graded,
    averageGpa: graded > 0 ? points / graded : null,
    aOrBShare: graded > 0 ? aOrB / graded : null,
  };
}

/** "2.93" */
export function formatGpa(gpa: number): string {
  return gpa.toFixed(2);
}

/** "64%" */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** "64% got an A or B · average GPA 2.93"; null when there are no letter grades. */
export function gradeSentence(summary: GradeSummary): string | null {
  if (summary.averageGpa === null || summary.aOrBShare === null) return null;
  return `${formatShare(summary.aOrBShare)} got an A or B · average GPA ${formatGpa(summary.averageGpa)}`;
}

export type GradeBarLetter = "A" | "B" | "C" | "D" | "F" | "W" | "Other";

export type GradeSegment = {
  readonly key: GradeKey;
  /** "+", "", "−" within a letter; "" for F, W and Other. */
  readonly modifier: "+" | "" | "−";
  readonly count: number;
  /** Of every student in the data, 0–1. */
  readonly share: number;
};

export type GradeBar = {
  readonly letter: GradeBarLetter;
  readonly count: number;
  /** Of every student in the data, 0–1. */
  readonly share: number;
  /** Top to bottom: +, plain, −. One segment for F, W and Other. */
  readonly segments: readonly GradeSegment[];
};

const BARS: readonly { letter: GradeBarLetter; keys: readonly GradeKey[] }[] = [
  { letter: "A", keys: ["A+", "A", "A-"] },
  { letter: "B", keys: ["B+", "B", "B-"] },
  { letter: "C", keys: ["C+", "C", "C-"] },
  { letter: "D", keys: ["D+", "D", "D-"] },
  { letter: "F", keys: ["F"] },
  { letter: "W", keys: ["W"] },
  { letter: "Other", keys: ["Other"] },
];

function modifierOf(key: GradeKey): GradeSegment["modifier"] {
  if (key.length === 2 && key.endsWith("+")) return "+";
  if (key.length === 2 && key.endsWith("-")) return "−";
  return "";
}

/** One bar each for A, B, C, D, F, W and Other; letters split into +/plain/−. */
export function gradeBars(counts: GradeCounts): GradeBar[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const share = (n: number) => (total > 0 ? n / total : 0);
  return BARS.map(({ letter, keys }) => {
    const segments = keys.map((key) => {
      const n = count(counts, key);
      return { key, modifier: modifierOf(key), count: n, share: share(n) };
    });
    const n = segments.reduce((a, s) => a + s.count, 0);
    return { letter, count: n, share: share(n), segments };
  });
}

/** "4.2" and "38 reviews" for an instructor; null rating reads "No reviews". */
export function formatRating(
  rating: number | null,
  reviewCount: number,
): { rating: string | null; reviews: string } {
  const reviews =
    reviewCount === 0
      ? "No reviews"
      : `${reviewCount} review${reviewCount === 1 ? "" : "s"}`;
  return {
    rating: rating === null || reviewCount === 0 ? null : rating.toFixed(1),
    reviews,
  };
}
