import type {
  CourseCode,
  Credits,
  RankBy,
  ScoreBreakdown,
  TravelSettings,
} from "../schema";
import { sparseIntersects } from "../time/slots";
import { itemsOverlap, type MeetingItem } from "../time/week";
import type { CampusMap } from "../travel/campus";
import {
  buildConnection,
  isConsecutive,
  isStop,
  type Stop,
} from "../travel/connections";
import { longestRoute } from "../travel/routes-binary";
import { travelMode, walkMinutes } from "../travel/walk";
import type { SectionGroup } from "./candidates";
import { breakdownOf, RANK_FACTORS, rankWeights, ScoreTally } from "./score";

// Steps 3–5 of the recipe (RESEARCH §2): a depth-first search over one
// choice per course, fewest candidates first, with 5-minute bitmasks for
// clash checks and a step budget. Only the best `maxResults` are kept (a
// min-heap by score), so the search never enumerates results it can't show.

export type VarRole =
  | { readonly kind: "required" }
  | { readonly kind: "optional" }
  /** Counts toward pick group `group` ("pick N of these"). */
  | { readonly kind: "pick"; readonly group: number };

export type SolveVar = {
  readonly courseCode: CourseCode;
  readonly groups: readonly SectionGroup[];
  readonly role: VarRole;
  /** null when the course isn't in the catalog (it can only be skipped). */
  readonly credits: Credits | null;
};

export type SolveProgress = { readonly steps: number; readonly found: number };

export type SolveProblem = {
  readonly vars: readonly SolveVar[];
  /** Exactly `count` of each pick group's courses go in every result. */
  readonly picks: readonly { readonly count: number }[];
  readonly credits: {
    readonly min: number | null;
    readonly max: number | null;
  };
  /** Reject connections without enough time to walk (null: don't check travel). */
  readonly travel: TravelSettings | null;
  readonly campus: CampusMap;
  readonly rankBy: RankBy;
  readonly maxResults: number;
  readonly maxSteps: number;
  readonly onProgress?: (progress: SolveProgress) => void;
  /** Checked now and then; returning true stops the search with what it has. */
  readonly shouldCancel?: () => boolean;
};

export type Solution = {
  /** One entry per var, in var order: the chosen group, or null when skipped. */
  readonly choices: readonly (SectionGroup | null)[];
  readonly score: number;
  readonly breakdown: ScoreBreakdown;
};

export type SolveOutcome = {
  /** Best first. */
  readonly solutions: readonly Solution[];
  /** Distinct results found (each group combination once). */
  readonly found: number;
  readonly steps: number;
  /** Stopped at the step budget or by cancellation: better plans may exist. */
  readonly truncated: boolean;
  readonly cancelled: boolean;
};

const PROGRESS_EVERY = 1 << 14;

/** Required first (they prune hardest), then pick groups, then optional; fewest candidates first. */
export function orderVars(vars: readonly SolveVar[]): SolveVar[] {
  const rank = (v: SolveVar) =>
    v.role.kind === "required" ? 0 : v.role.kind === "pick" ? 1 : 2;
  return [...vars].sort(
    (a, b) => rank(a) - rank(b) || a.groups.length - b.groups.length,
  );
}

type HeapEntry = { solution: Solution; seq: number };

/** Lower is worse: lower score, or the same score found later. */
function worse(a: HeapEntry, b: HeapEntry): boolean {
  return (
    a.solution.score < b.solution.score ||
    (a.solution.score === b.solution.score && a.seq > b.seq)
  );
}

/** A fixed-size min-heap: the root is the worst kept solution. */
class TopK {
  private readonly heap: HeapEntry[] = [];
  constructor(private readonly size: number) {}

  offer(entry: HeapEntry): void {
    const h = this.heap;
    if (h.length < this.size) {
      h.push(entry);
      this.up(h.length - 1);
    } else if (h[0] && worse(h[0], entry)) {
      h[0] = entry;
      this.down(0);
    }
  }

  /** Whether a solution with this score could still get in. */
  wouldAccept(score: number): boolean {
    const root = this.heap[0];
    return (
      this.heap.length < this.size ||
      root === undefined ||
      score > root.solution.score
    );
  }

  bestFirst(): Solution[] {
    return [...this.heap]
      .sort((a, b) => (worse(a, b) ? 1 : worse(b, a) ? -1 : 0))
      .map((e) => e.solution);
  }

  private up(i: number): void {
    const h = this.heap;
    let child = i;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const c = h[child] as HeapEntry;
      const p = h[parent] as HeapEntry;
      if (!worse(c, p)) break;
      h[child] = p;
      h[parent] = c;
      child = parent;
    }
  }

  private down(i: number): void {
    const h = this.heap;
    let parent = i;
    for (;;) {
      const l = 2 * parent + 1;
      const r = l + 1;
      let worst = parent;
      if (l < h.length && worse(h[l] as HeapEntry, h[worst] as HeapEntry))
        worst = l;
      if (r < h.length && worse(h[r] as HeapEntry, h[worst] as HeapEntry))
        worst = r;
      if (worst === parent) return;
      const tmp = h[parent] as HeapEntry;
      h[parent] = h[worst] as HeapEntry;
      h[worst] = tmp;
      parent = worst;
    }
  }
}

/** Longest walk on campus in minutes for these settings; null without routes. */
export function maxWalkMinutes(
  campus: CampusMap,
  travel: TravelSettings,
): number | null {
  return campus.routes
    ? walkMinutes(longestRoute(campus.routes, travelMode(travel)), travel)
    : null;
}

/**
 * The walk between a meeting of `a` and one of `b` that wouldn't leave enough
 * time, were they consecutive; null when every such walk is fine.
 */
export function shortWalkBetween(
  a: SectionGroup,
  b: SectionGroup,
  travel: TravelSettings,
  campus: CampusMap,
  maxWalk: number,
): { from: Stop; to: Stop } | null {
  for (const x of a.items) {
    if (!isStop(x, campus)) continue;
    for (const y of b.items) {
      if (y.day !== x.day || !isStop(y, campus)) continue;
      const [from, to] = x.end <= y.start ? [x, y] : [y, x];
      const gap = to.start - from.end;
      if (gap < 0 || gap >= maxWalk) continue;
      const sameDay = [...a.items, ...b.items].filter(
        (i) => i.day === x.day && isStop(i, campus),
      );
      if (!isConsecutive(from, to, sameDay)) continue;
      if (buildConnection(from, to, travel, campus)?.verdict === "insufficient")
        return { from, to };
    }
  }
  return null;
}

/** A meeting of `a` that overlaps one of `b` (exact times and dates), or null. */
export function overlapBetween(
  a: SectionGroup,
  b: SectionGroup,
): MeetingItem | null {
  if (!sparseIntersects(a.sparse, b.mask)) return null;
  for (const x of a.items)
    for (const y of b.items) if (itemsOverlap(x, y)) return x;
  return null;
}

/** Whether two groups can be in one plan: no overlap, and (when asked) time to walk. */
export function compatible(
  a: SectionGroup,
  b: SectionGroup,
  travel: TravelSettings | null,
  campus: CampusMap,
  maxWalk: number | null,
): boolean {
  if (overlapBetween(a, b)) return false;
  return !(
    travel &&
    maxWalk !== null &&
    shortWalkBetween(a, b, travel, campus, maxWalk)
  );
}

const hasBit = (bits: Uint32Array, i: number) =>
  (((bits[i >>> 5] as number) >>> (i & 31)) & 1) === 1;

/**
 * The search. Every pair of candidate groups is checked once up front
 * (overlap, and travel when asked), into one bitset per group of the groups
 * it can sit beside; the search then keeps the running intersection, so
 * trying a section is a single bit test, and a required course with nothing
 * left ends the branch at once (forward checking).
 *
 * Travel is judged pair by pair. Two classes too close for the walk between
 * them can only have a class between them if that class is shorter than the
 * gap (under the campus's longest walk, about 20 minutes), which doesn't
 * happen at UMD, so this matches judging whole plans.
 */
export function solve(problem: SolveProblem): SolveOutcome {
  const vars = problem.vars;
  const n = vars.length;
  const maxWalk = problem.travel
    ? maxWalkMinutes(problem.campus, problem.travel)
    : null;

  // Every group gets a global index; each var owns a contiguous range.
  const all: SectionGroup[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  for (const v of vars) {
    lo.push(all.length);
    all.push(...v.groups);
    hi.push(all.length);
  }
  const words = Math.max(1, Math.ceil(all.length / 32));
  const rangeBits = vars.map((_, k) => {
    const bits = new Uint32Array(words);
    for (let i = lo[k] as number; i < (hi[k] as number); i++)
      bits[i >>> 5] = ((bits[i >>> 5] as number) | (1 << (i & 31))) >>> 0;
    return bits;
  });
  const varOf = new Array<number>(all.length);
  vars.forEach((_, k) => {
    for (let i = lo[k] as number; i < (hi[k] as number); i++) varOf[i] = k;
  });
  const compat = all.map(() => new Uint32Array(words));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (varOf[i] === varOf[j]) continue;
      if (
        !compatible(
          all[i] as SectionGroup,
          all[j] as SectionGroup,
          problem.travel,
          problem.campus,
          maxWalk,
        )
      )
        continue;
      const ci = compat[i] as Uint32Array;
      const cj = compat[j] as Uint32Array;
      ci[j >>> 5] = ((ci[j >>> 5] as number) | (1 << (j & 31))) >>> 0;
      cj[i >>> 5] = ((cj[i >>> 5] as number) | (1 << (i & 31))) >>> 0;
    }
  }
  const allowed = Array.from({ length: n + 1 }, () => new Uint32Array(words));
  (allowed[0] as Uint32Array).fill(0xffffffff);
  const requiredAfter = vars.map((_, k) =>
    vars.flatMap((v, m) => (m > k && v.role.kind === "required" ? [m] : [])),
  );

  const top = new TopK(Math.max(1, problem.maxResults));
  const tally = new ScoreTally();
  const weights = rankWeights(problem.rankBy);
  const factors = new Float64Array(RANK_FACTORS.length);
  const choices: (SectionGroup | null)[] = new Array(n).fill(null);
  const pickCounts = problem.picks.map(() => 0);
  const pickLeft = problem.picks.map(() => 0);
  for (const v of vars)
    if (v.role.kind === "pick")
      pickLeft[v.role.group] = (pickLeft[v.role.group] ?? 0) + 1;
  const { min: minCredits, max: maxCredits } = problem.credits;

  let steps = 0;
  let found = 0;
  let stopped = false;
  let cancelled = false;
  let creditsLow = 0;
  let creditsHigh = 0;
  let included = 0;

  const tick = (): boolean => {
    steps++;
    if (steps >= problem.maxSteps) {
      stopped = true;
      return false;
    }
    if ((steps & (PROGRESS_EVERY - 1)) === 0) {
      problem.onProgress?.({ steps, found });
      if (problem.shouldCancel?.()) {
        stopped = true;
        cancelled = true;
        return false;
      }
    }
    return true;
  };

  /** Every later required course still has a section that fits. */
  const viable = (depth: number, bits: Uint32Array): boolean => {
    for (const m of requiredAfter[depth] ?? []) {
      const range = rangeBits[m] as Uint32Array;
      let any = false;
      for (let w = 0; w < words && !any; w++)
        any = ((bits[w] as number) & (range[w] as number)) >>> 0 !== 0;
      if (!any) return false;
    }
    return true;
  };

  const leaf = () => {
    if (included === 0) return;
    for (let p = 0; p < problem.picks.length; p++)
      if (pickCounts[p] !== problem.picks[p]?.count) return;
    if (minCredits !== null && creditsHigh < minCredits) return;
    found++;
    tally.factors(factors);
    let score = 0;
    for (let f = 0; f < factors.length; f++)
      score += (factors[f] as number) * (weights[f] as number);
    if (!top.wouldAccept(score)) return;
    const breakdown = breakdownOf(factors);
    top.offer({
      solution: { choices: [...choices], score, breakdown },
      seq: found,
    });
  };

  const visit = (depth: number): void => {
    if (stopped || !tick()) return;
    if (depth === n) {
      leaf();
      return;
    }
    const v = vars[depth] as SolveVar;
    const bits = allowed[depth] as Uint32Array;
    const next = allowed[depth + 1] as Uint32Array;
    const pick = v.role.kind === "pick" ? v.role.group : -1;
    if (pick >= 0) pickLeft[pick] = (pickLeft[pick] ?? 0) - 1;

    const canInclude =
      v.credits !== null &&
      (pick < 0 ||
        (pickCounts[pick] ?? 0) < (problem.picks[pick]?.count ?? 0)) &&
      (maxCredits === null || creditsLow + v.credits.min <= maxCredits);
    const last = depth === n - 1;
    if (canInclude && v.credits) {
      for (
        let i = lo[depth] as number;
        i < (hi[depth] as number) && !stopped;
        i++
      ) {
        if (!hasBit(bits, i)) continue;
        const g = all[i] as SectionGroup;
        if (last) {
          // The last course: each choice is a finished plan. Scoring it in
          // place skips a call, a bitset and a viability check per plan,
          // which is most of the work when plans are plentiful.
          if (!tick()) break;
          if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) + 1;
          choices[depth] = g;
          tally.add(g);
          creditsHigh += v.credits.max;
          included++;
          leaf();
          included--;
          creditsHigh -= v.credits.max;
          tally.remove(g);
          choices[depth] = null;
          if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) - 1;
          continue;
        }
        const c = compat[i] as Uint32Array;
        for (let w = 0; w < words; w++)
          next[w] = ((bits[w] as number) & (c[w] as number)) >>> 0;
        if (!viable(depth, next)) continue;
        choices[depth] = g;
        tally.add(g);
        creditsLow += v.credits.min;
        creditsHigh += v.credits.max;
        included++;
        if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) + 1;
        visit(depth + 1);
        if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) - 1;
        included--;
        creditsHigh -= v.credits.max;
        creditsLow -= v.credits.min;
        tally.remove(g);
        choices[depth] = null;
      }
    }

    // Skipping: always for optional courses; for a pick group only while
    // the rest of the group can still make up the count.
    const canSkip =
      v.role.kind === "optional" ||
      (pick >= 0 &&
        (pickCounts[pick] ?? 0) + (pickLeft[pick] ?? 0) >=
          (problem.picks[pick]?.count ?? 0));
    if (canSkip && !stopped) {
      next.set(bits);
      visit(depth + 1);
    }
    if (pick >= 0) pickLeft[pick] = (pickLeft[pick] ?? 0) + 1;
  };

  // A required course with no candidates at all can't be placed.
  if (
    vars.every((v) => v.role.kind !== "required" || v.groups.length > 0) &&
    viable(-1, allowed[0] as Uint32Array)
  )
    visit(0);
  problem.onProgress?.({ steps, found });
  return {
    solutions: top.bestFirst(),
    found,
    steps,
    truncated: stopped,
    cancelled,
  };
}
