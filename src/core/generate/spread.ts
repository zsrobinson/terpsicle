import type { FilterCount, GeneratedPlan, RankFactor } from "../schema";
import { formatTime, formatTimeRange } from "../time/format";
import { EARLY, LATE, WORST_GAP_MINUTES } from "./score";

// What a Generate chip's card charts (SPEC §3.9): how the plans on screen
// spread out on what a preference ranks by or a filter looks at, and how
// many plans a filter took out. Read off each result's stats and scores, on
// the same fixed scales the ranking and the result rows use (score.ts,
// preferences.ts), so the card and the rows never disagree.

/** A preference, or a plan stat a filter looks at. */
export type SpreadMeasure =
  | RankFactor
  | "first-class"
  | "last-class"
  | "credits";

export type SpreadBin = {
  /** The bin in words, for a screen reader and a bar's count: "9am–10am". */
  readonly label: string;
  /** Short enough to sit under a bar: "9am", "2h", "3.5". */
  readonly tick: string;
  readonly count: number;
};

export type Spread = {
  /** Empty bins at either end left off; empty ones between them kept. */
  readonly bins: readonly SpreadBin[];
  /** The bin the first plan (the best, as ranked) is in; null when it has no value. */
  readonly top: number | null;
  /** Plans with nothing to measure: no ratings, no seat counts, nothing timed. */
  readonly unknown: number;
  /** Plans counted in the bins. */
  readonly counted: number;
  /** The end a preference ranks higher; null for a filter's stat. */
  readonly better: "low" | "high" | null;
};

type Scale = {
  readonly bins: readonly Omit<SpreadBin, "count">[];
  /** The plan's bin, or null when there's nothing to measure. */
  readonly binOf: (plan: GeneratedPlan) => number | null;
  readonly better: Spread["better"];
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const clampIndex = (i: number, n: number) => Math.min(n - 1, Math.max(0, i));
/** "9am" → "9", "12:30pm" → "12:30": the axis says it's a time. */
const bare = (minutes: number) => formatTime(minutes).replace(/[ap]m$/, "");

const GAP_HOURS = 8;
const GAPS: Scale = {
  // Hours between classes a week, as the rows' "2 hr gaps", to the hour.
  bins: range(GAP_HOURS + 1).map((h) => ({
    tick: h === GAP_HOURS ? `${h}h+` : `${h}h`,
    label:
      h === 0
        ? "Under half an hour of gaps"
        : h === GAP_HOURS
          ? `${h} hours of gaps or more`
          : `About ${h} hour${h === 1 ? "" : "s"} of gaps`,
  })),
  binOf: (p) =>
    clampIndex(
      // To 5 minutes first, as the rows round, so float noise in the score
      // can't move a plan that's exactly on a half hour.
      Math.round(
        Math.round(((1 - p.breakdown.compact) * WORST_GAP_MINUTES) / 5) / 12,
      ),
      GAP_HOURS + 1,
    ),
  better: "low",
};

const MOST_DAYS = 6;
const DAYS: Scale = {
  bins: range(MOST_DAYS + 1).map((d) => ({
    tick: d === MOST_DAYS ? `${d}+` : String(d),
    label:
      d === 0
        ? "No days on campus"
        : `${d}${d === MOST_DAYS ? " or more" : ""} day${d === 1 ? "" : "s"} on campus`,
  })),
  binOf: (p) => clampIndex(p.stats.daysOnCampus, MOST_DAYS + 1),
  better: "low",
};

const START_STEP = 30;
const START_BINS = (LATE - EARLY) / START_STEP + 1;
const STARTS: Scale = {
  // The ranking's average start, which stops at 8am and noon (score.ts).
  bins: range(START_BINS).map((i) => {
    const at = EARLY + i * START_STEP;
    return {
      tick: bare(at),
      label:
        i === 0
          ? `Average start ${formatTime(at)} or earlier`
          : i === START_BINS - 1
            ? `Average start ${formatTime(at)} or later`
            : `Average start about ${formatTime(at)}`,
    };
  }),
  binOf: (p) =>
    clampIndex(
      Math.round((p.breakdown["later-starts"] * (LATE - EARLY)) / START_STEP),
      START_BINS,
    ),
  better: "high",
};

const RATINGS: Scale = {
  // 1 to 5 by halves.
  bins: range(9).map((i) => {
    const r = (1 + i / 2).toFixed(1);
    return { tick: r, label: `Rated about ${r}` };
  }),
  binOf: (p) =>
    p.stats.avgRating === null
      ? null
      : clampIndex(Math.round((p.stats.avgRating - 1) * 2), 9),
  better: "high",
};

const GPA_STEPS = 10;
const GPAS: Scale = {
  // Under 2, then 2.0 to 4.0 by fifths, where nearly every course falls.
  bins: [
    { tick: "<2", label: "Average GPA under 2.0" },
    ...range(GPA_STEPS).map((i) => {
      const from = 2 + i / 5;
      return {
        tick: from.toFixed(1),
        label: `Average GPA ${from.toFixed(1)}–${(from + 0.2).toFixed(1)}`,
      };
    }),
  ],
  binOf: (p) => {
    const gpa = p.stats.avgGpa;
    if (gpa === null) return null;
    if (gpa < 2) return 0;
    return 1 + clampIndex(Math.floor((gpa - 2) * 5 + 1e-9), GPA_STEPS);
  },
  better: "high",
};

/** Open seats in a plan's tightest section, from full to the safe 30 (score.ts). */
const SEAT_EDGES = [0, 1, 5, 10, 20, 30] as const;
const SEATS: Scale = {
  bins: SEAT_EDGES.map((from, i) => {
    const next = SEAT_EDGES[i + 1];
    if (from === 0) return { tick: "0", label: "A section is full" };
    if (next === undefined)
      return { tick: `${from}+`, label: `${from} or more seats left` };
    return {
      tick: `${from}–${next - 1}`,
      label: `${from}–${next - 1} seats left`,
    };
  }),
  binOf: (p) => {
    const open = p.stats.fewestOpenSeats;
    if (open === null) return null;
    let bin = 0;
    SEAT_EDGES.forEach((from, i) => {
      if (open >= from) bin = i;
    });
    return bin;
  },
  better: "high",
};

/** By the hour a plan's first (or last) class of the week falls in. */
function hours(of: "firstClass" | "lastClass", words: string): Scale {
  return {
    bins: range(24).map((h) => ({
      tick: formatTime(h * 60),
      label: `${words} ${formatTimeRange(h * 60, (h + 1) * 60)}`,
    })),
    binOf: (p) => {
      const at = p.stats[of];
      return at === null ? null : clampIndex(Math.floor(at / 60), 24);
    },
    better: null,
  };
}

const MOST_CREDITS = 30;
const CREDITS: Scale = {
  bins: range(MOST_CREDITS + 1).map((n) => ({
    tick: String(n),
    label: `${n} credit${n === 1 ? "" : "s"}`,
  })),
  binOf: (p) => clampIndex(Math.floor(p.stats.credits), MOST_CREDITS + 1),
  better: null,
};

const SCALES: Record<SpreadMeasure, Scale> = {
  compact: GAPS,
  "fewer-days": DAYS,
  "later-starts": STARTS,
  "best-rated": RATINGS,
  "higher-gpa": GPAS,
  "safest-seats": SEATS,
  "first-class": hours("firstClass", "First class"),
  "last-class": hours("lastClass", "Last class ends"),
  credits: CREDITS,
};

/**
 * How `plans` (best first) spread out on `measure`, binned on a fixed
 * scale, with the first plan's bin marked. Null when no plan has a value to
 * chart (no ratings at all, nothing timed).
 */
export function planSpread(
  measure: SpreadMeasure,
  plans: readonly GeneratedPlan[],
): Spread | null {
  const scale = SCALES[measure];
  const counts = scale.bins.map(() => 0);
  let unknown = 0;
  for (const plan of plans) {
    const bin = scale.binOf(plan);
    if (bin === null) unknown++;
    else counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const first = counts.findIndex((n) => n > 0);
  if (first < 0) return null;
  const last = counts.findLastIndex((n) => n > 0);
  const [best] = plans;
  const topBin = best ? scale.binOf(best) : null;
  return {
    bins: scale.bins
      .slice(first, last + 1)
      .map((bin, i) => ({ ...bin, count: counts[first + i] ?? 0 })),
    top: topBin === null ? null : topBin - first,
    unknown,
    counted: plans.length - unknown,
    better: scale.better,
  };
}

export type FilterRemoval = {
  /** Plans the run found with the filter on. */
  readonly kept: number;
  /** Plans the filter took out: a floor when `atLeast`. */
  readonly removed: number;
  readonly atLeast: boolean;
  /** The plans there'd be without it. */
  readonly without: number;
  /** Of those, the share it took out, 0–1. */
  readonly share: number;
};

/** What one filter did to a run that found `found` plans ("−306 of 1,234"). */
export function filterRemoval(
  count: FilterCount,
  found: number,
): FilterRemoval {
  const kept = Math.max(0, found);
  const without = kept + count.removed;
  return {
    kept,
    removed: count.removed,
    atLeast: count.atLeast,
    without,
    share: without === 0 ? 0 : count.removed / without,
  };
}
