import {
  DAYS,
  type PlanStats,
  type RankBy,
  type RankFactor,
  RankFactorSchema,
  type ScoreBreakdown,
} from "../schema";
import type { SectionGroup } from "./candidates";

// Ranking (SPEC §3.9 "Rank by"). Every factor maps to 0–1, higher is better,
// with fixed, explainable scales rather than scales relative to the result
// set, so a plan's score doesn't change when other results come and go.

export const RANK_FACTORS = RankFactorSchema.options;

// Read once: imported bindings can cost a lookup per read in some module runners.
const DAY_COUNT = DAYS.length;

export const RANK_FACTOR_LABELS = {
  compact: "Compact days",
  "fewer-days": "Fewer days on campus",
  "later-starts": "Later starts",
  "best-rated": "Best-rated instructors",
  "higher-gpa": "Higher average GPA",
  "safest-seats": "Safest seats",
} as const satisfies Record<RankFactor, string>;

/** Scales: a week with 20 idle hours between classes scores 0 for compactness. */
const WORST_GAP_MINUTES = 20 * 60;
/** Starts: 8am scores 0, noon scores 1. */
const EARLY = 8 * 60;
const LATE = 12 * 60;
/** Seats: 30 or more open in the tightest section is as safe as it gets. */
const SAFE_SEATS = 30;
/** Neutral when there's nothing to go on (no ratings, no seat counts). */
const NEUTRAL = 0.5;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Running totals for a plan being built: added and removed a group at a time
 * as the search moves, so scoring a finished plan costs a few additions
 * instead of a pass over its meetings.
 */
export class ScoreTally {
  private readonly first = new Array<number>(DAY_COUNT).fill(Infinity);
  private readonly last = new Array<number>(DAY_COUNT).fill(-Infinity);
  private readonly busy = new Array<number>(DAY_COUNT).fill(0);
  private readonly count = new Array<number>(DAY_COUNT).fill(0);
  private readonly inPerson = new Array<number>(DAY_COUNT).fill(0);
  /** Each added item's day and the day's previous first and last, to undo. */
  private readonly saved: number[] = [];
  private readonly fewestStack: (number | null)[] = [];
  private ratingSum = 0;
  private ratingN = 0;
  private gpaSum = 0;
  private gpaN = 0;
  private fewest: number | null = null;
  credits = 0;

  add(g: SectionGroup): void {
    for (let k = 0; k < g.items.length; k++) {
      const item = g.items[k] as SectionGroup["items"][number];
      const d = g.dayIndexes[k] as number;
      this.saved.push(this.first[d] as number, this.last[d] as number);
      this.first[d] = Math.min(this.first[d] as number, item.start);
      this.last[d] = Math.max(this.last[d] as number, item.end);
      this.busy[d] = (this.busy[d] as number) + item.end - item.start;
      this.count[d] = (this.count[d] as number) + 1;
      if (item.source.inPerson)
        this.inPerson[d] = (this.inPerson[d] as number) + 1;
    }
    if (g.rating !== null) {
      this.ratingSum += g.rating;
      this.ratingN++;
    }
    if (g.gpa !== null) {
      this.gpaSum += g.gpa;
      this.gpaN++;
    }
    this.fewestStack.push(this.fewest);
    if (g.openSeats !== null)
      this.fewest =
        this.fewest === null ? g.openSeats : Math.min(this.fewest, g.openSeats);
    this.credits += g.course.credits.min;
  }

  /** Undoes the most recent `add` (groups come off in reverse order). */
  remove(g: SectionGroup): void {
    this.credits -= g.course.credits.min;
    this.fewest = this.fewestStack.pop() ?? null;
    if (g.gpa !== null) {
      this.gpaSum -= g.gpa;
      this.gpaN--;
    }
    if (g.rating !== null) {
      this.ratingSum -= g.rating;
      this.ratingN--;
    }
    for (let k = g.items.length - 1; k >= 0; k--) {
      const item = g.items[k] as SectionGroup["items"][number];
      const d = g.dayIndexes[k] as number;
      if (item.source.inPerson)
        this.inPerson[d] = (this.inPerson[d] as number) - 1;
      this.count[d] = (this.count[d] as number) - 1;
      this.busy[d] = (this.busy[d] as number) - (item.end - item.start);
      this.last[d] = this.saved.pop() as number;
      this.first[d] = this.saved.pop() as number;
    }
  }

  stats(): PlanStats {
    let first: number | null = null;
    let last: number | null = null;
    let onCampus = 0;
    for (let d = 0; d < DAY_COUNT; d++) {
      if ((this.count[d] as number) === 0) continue;
      first = Math.min(first ?? Infinity, this.first[d] as number);
      last = Math.max(last ?? -Infinity, this.last[d] as number);
      if ((this.inPerson[d] as number) > 0) onCampus++;
    }
    return {
      credits: this.credits,
      daysOnCampus: onCampus,
      firstClass: first,
      lastClass: last,
      avgRating: this.ratingN ? this.ratingSum / this.ratingN : null,
      avgGpa: this.gpaN ? this.gpaSum / this.gpaN : null,
      fewestOpenSeats: this.fewest,
    };
  }

  /** The factors in `RANK_FACTORS` order, written into `out` (no allocation). */
  factors(out: Float64Array): Float64Array {
    let gaps = 0;
    let startSum = 0;
    let days = 0;
    let onCampus = 0;
    for (let d = 0; d < DAY_COUNT; d++) {
      if ((this.count[d] as number) === 0) continue;
      const first = this.first[d] as number;
      gaps += Math.max(
        0,
        (this.last[d] as number) - first - (this.busy[d] as number),
      );
      startSum += first;
      days++;
      if ((this.inPerson[d] as number) > 0) onCampus++;
    }
    out[0] = 1 - clamp01(gaps / WORST_GAP_MINUTES);
    // Five days on campus scores 0; one day scores 1; none (all online) too.
    out[1] = clamp01((5 - onCampus) / 4);
    out[2] = days ? clamp01((startSum / days - EARLY) / (LATE - EARLY)) : 1;
    out[3] = this.ratingN
      ? clamp01((this.ratingSum / this.ratingN - 1) / 4)
      : NEUTRAL;
    // GPAs mostly fall between 2 and 4, so that range spans the scale.
    out[4] = this.gpaN ? clamp01((this.gpaSum / this.gpaN - 2) / 2) : NEUTRAL;
    out[5] = this.fewest === null ? NEUTRAL : clamp01(this.fewest / SAFE_SEATS);
    return out;
  }

  breakdown(): ScoreBreakdown {
    return breakdownOf(this.factors(new Float64Array(RANK_FACTORS.length)));
  }
}

/** Factor values (in `RANK_FACTORS` order) as a breakdown object. */
export function breakdownOf(factors: Float64Array): ScoreBreakdown {
  const out = {} as Record<RankFactor, number>;
  RANK_FACTORS.forEach((f, i) => {
    out[f] = factors[i] ?? 0;
  });
  return out;
}

function tallyOf(groups: readonly SectionGroup[]): ScoreTally {
  const tally = new ScoreTally();
  for (const g of groups) tally.add(g);
  return tally;
}

/** The plain stats a result shows ("4 days · first class 10am · ★ 4.1"). */
export function planStats(groups: readonly SectionGroup[]): PlanStats {
  return tallyOf(groups).stats();
}

/** Each factor, 0–1, higher is better. */
export function scoreBreakdown(
  groups: readonly SectionGroup[],
): ScoreBreakdown {
  return tallyOf(groups).breakdown();
}

/**
 * One weight per factor (in `RANK_FACTORS` order) so a score is a dot
 * product. A preset ranks by its factor, with the other factors as a faint
 * tie-breaker so equal plans still come in a sensible order; custom weights
 * are a weighted mean (an even mean when every weight is 0).
 */
export function rankWeights(rankBy: RankBy): Float64Array {
  const n = RANK_FACTORS.length;
  const w = new Float64Array(n);
  if (rankBy.preset !== "custom") {
    RANK_FACTORS.forEach((f, i) => {
      w[i] = (f === rankBy.preset ? 1 : 0) + 0.01 / n;
    });
    return w;
  }
  const total = RANK_FACTORS.reduce(
    (sum, f) => sum + (rankBy.weights[f] ?? 0),
    0,
  );
  RANK_FACTORS.forEach((f, i) => {
    w[i] = total > 0 ? (rankBy.weights[f] ?? 0) / total : 1 / n;
  });
  return w;
}

export function dot(factors: Float64Array, weights: Float64Array): number {
  let score = 0;
  for (let i = 0; i < weights.length; i++)
    score += (factors[i] ?? 0) * (weights[i] ?? 0);
  return score;
}

/** One number to rank by (see `rankWeights`). */
export function totalScore(breakdown: ScoreBreakdown, rankBy: RankBy): number {
  return dot(
    Float64Array.from(RANK_FACTORS, (f) => breakdown[f]),
    rankWeights(rankBy),
  );
}
