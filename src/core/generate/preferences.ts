import type { PlanStats, RankBy, RankFactor, ScoreBreakdown } from "../schema";
import { formatDuration, formatTime } from "../time/format";
import { EARLY, LATE, RANK_FACTORS, WORST_GAP_MINUTES } from "./score";

// Generate's preferences (SPEC §3.9): each ranking factor is a chip that's
// off, on, or counted double. They're stored as the ranking the generator
// already takes (`RankBy`), so a saved draft from before the chips still
// reads: one factor on is its preset, anything else is custom weights.

/** Off, on (1×) or double (2×). */
export type PreferenceLevel = 0 | 1 | 2;
export type PreferenceLevels = Readonly<Record<RankFactor, PreferenceLevel>>;

export const NO_PREFERENCES: PreferenceLevels = {
  compact: 0,
  "fewer-days": 0,
  "later-starts": 0,
  "best-rated": 0,
  "higher-gpa": 0,
  "safest-seats": 0,
};

/** A click on a preference chip: off → on → double → off. */
export function nextLevel(level: PreferenceLevel): PreferenceLevel {
  return level === 0 ? 1 : level === 1 ? 2 : 0;
}

/** A weight as a chip: nothing is off, up to half is on, more is double. */
function levelOf(weight: number): PreferenceLevel {
  return weight <= 0 ? 0 : weight <= 0.5 ? 1 : 2;
}

/** The chips a ranking shows. */
export function preferenceLevels(rankBy: RankBy): PreferenceLevels {
  if (rankBy.preset !== "custom")
    return { ...NO_PREFERENCES, [rankBy.preset]: 1 };
  const out = { ...NO_PREFERENCES };
  for (const f of RANK_FACTORS) out[f] = levelOf(rankBy.weights[f] ?? 0);
  return out;
}

/**
 * The ranking the chips ask for. One factor on is its preset, which keeps
 * the preset's tie-breaker; otherwise on weighs half what double does. With
 * none on, the weights are all 0: an even mix (`rankWeights`).
 */
export function rankByFromLevels(levels: PreferenceLevels): RankBy {
  const on = RANK_FACTORS.filter((f) => levels[f] > 0);
  const [only] = on;
  if (only && on.length === 1 && levels[only] === 1) return { preset: only };
  const weights = { ...NO_PREFERENCES } as Record<RankFactor, number>;
  for (const f of RANK_FACTORS) weights[f] = levels[f] / 2;
  return { preset: "custom", weights };
}

/** The factors that are on, double ones first, each group in chip order. */
export function activePreferences(levels: PreferenceLevels): RankFactor[] {
  return [
    ...RANK_FACTORS.filter((f) => levels[f] === 2),
    ...RANK_FACTORS.filter((f) => levels[f] === 1),
  ];
}

export type PreferenceMark = {
  /** 0–1, higher is better: the factor's score in the ranking. */
  readonly score: number;
  /** What the score stands for, short enough for a result row: "4 days", "10:30am avg start". */
  readonly words: string;
};

const roundTo5 = (minutes: number) => Math.round(minutes / 5) * 5;

/**
 * Why a result ranks where it does on one factor: its score, and the plain
 * number behind it. Scores use fixed scales (score.ts), so the words are
 * read back off the same scales.
 */
export function preferenceMark(
  factor: RankFactor,
  breakdown: ScoreBreakdown,
  stats: PlanStats,
): PreferenceMark {
  const score = breakdown[factor];
  return { score, words: markWords(factor, score, stats) };
}

function markWords(factor: RankFactor, score: number, s: PlanStats): string {
  switch (factor) {
    case "compact": {
      const gaps = roundTo5((1 - score) * WORST_GAP_MINUTES);
      return gaps === 0 ? "No gaps" : `${formatDuration(gaps)} gaps`;
    }
    case "fewer-days":
      return `${s.daysOnCampus} ${s.daysOnCampus === 1 ? "day" : "days"}`;
    case "later-starts":
      // The scale stops at noon: anything later scores the same, "12pm+".
      return score >= 1
        ? `${formatTime(LATE)}+ avg start`
        : `${formatTime(roundTo5(EARLY + score * (LATE - EARLY)))} avg start`;
    case "best-rated":
      return s.avgRating === null
        ? "No ratings"
        : `★ ${s.avgRating.toFixed(1)}`;
    case "higher-gpa":
      return s.avgGpa === null ? "No grades" : `${s.avgGpa.toFixed(2)} GPA`;
    case "safest-seats":
      return s.fewestOpenSeats === null
        ? "Seats unknown"
        : s.fewestOpenSeats === 0
          ? "A section is full"
          : `${s.fewestOpenSeats} seats left`;
  }
}
