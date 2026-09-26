import { wildcardCourses, wildcardId } from "../catalog/wildcard";
import type {
  Course,
  CourseCode,
  Credits,
  GenWildcardItem,
  WildcardReport,
} from "../schema";
import {
  type CandidateOptions,
  candidateGroups,
  type SectionGroup,
} from "./candidates";
import { dot, RANK_FACTORS, ScoreTally } from "./score";
import { overlapBetween } from "./solve";

// A wildcard as one choice in the search: every section group of every
// course it matches ("pick one course from this set"). ARTTXXX can match
// dozens of courses and a gen-ed well over a hundred, and the search checks
// every pair of groups up front, so the set is pruned and capped first:
// 1. sections that break a must-have go, as for any course;
// 2. so do groups that overlap every section of a required course, which no
//    plan could hold (pruning, nothing lost);
// 3. what's left is capped at `WILDCARD_GROUP_CAP` groups: each course's
//    groups best first by the person's ranking (judged on the group alone),
//    taken a round at a time across courses, so the cap keeps as many
//    different courses as it can before it keeps a second section of one.
// The report says how many courses matched, fit and were tried, so the
// results can be honest about a cap.

/**
 * Most section groups one wildcard offers the search. Two wildcards at the
 * cap beside four ordinary courses stay well inside BUILD §5's budget
 * (wildcards.perf.test.ts).
 */
export const WILDCARD_GROUP_CAP = 40;

export type WildcardOptionsInput = {
  readonly item: GenWildcardItem;
  /** The term's courses (the worker's index holds the ones the request needs). */
  readonly courses: Iterable<Course>;
  /** Courses listed on their own, which the wildcard mustn't pick again. */
  readonly listed: ReadonlySet<CourseCode>;
  readonly candidate: Omit<CandidateOptions, "only">;
  /** Each required course's groups: an option must fit beside every one of them. */
  readonly required: readonly (readonly SectionGroup[])[];
  /** `rankWeights(request.rankBy)`. */
  readonly weights: Float64Array;
  readonly cap?: number;
};

export type WildcardOptions = {
  /** Best first, a course at a time (see above). */
  readonly groups: SectionGroup[];
  readonly report: WildcardReport;
};

/** A group's score on its own, by the person's ranking. */
function scoreAlone(
  g: SectionGroup,
  tally: ScoreTally,
  factors: Float64Array,
  weights: Float64Array,
): number {
  tally.add(g);
  const score = dot(tally.factors(factors), weights);
  tally.remove(g);
  return score;
}

export function wildcardOptions(input: WildcardOptionsInput): WildcardOptions {
  const { item, candidate, required, weights } = input;
  const cap = input.cap ?? WILDCARD_GROUP_CAP;
  const matched = wildcardCourses(input.courses, item.wildcard, {
    exclude: input.listed,
  });
  const tally = new ScoreTally();
  const factors = new Float64Array(RANK_FACTORS.length);

  type Option = { groups: { g: SectionGroup; score: number }[]; best: number };
  const options: Option[] = [];
  for (const course of matched) {
    const groups = candidateGroups(course, { ...candidate, only: null })
      .filter(
        (g) =>
          // Near-misses keep what conflicts: counting conflicts is their job.
          candidate.keepViolations ||
          required.every(
            (r) => r.length === 0 || r.some((x) => !overlapBetween(g, x)),
          ),
      )
      .map((g) => ({ g, score: scoreAlone(g, tally, factors, weights) }))
      .sort(
        (a, b) =>
          a.g.violations.length - b.g.violations.length || b.score - a.score,
      );
    const first = groups[0];
    if (first)
      options.push({
        groups,
        best: first.score - first.g.violations.length,
      });
  }
  // Stable: equal courses keep code order.
  options.sort((a, b) => b.best - a.best);

  const groups: SectionGroup[] = [];
  const tried = new Set<CourseCode>();
  for (let round = 0; groups.length < cap; round++) {
    let any = false;
    for (const option of options) {
      const next = option.groups[round];
      if (!next) continue;
      any = true;
      groups.push(next.g);
      tried.add(next.g.course.code);
      if (groups.length >= cap) break;
    }
    if (!any) break;
  }
  return {
    groups,
    report: {
      wildcard: wildcardId(item.wildcard),
      matched: matched.length,
      fit: options.length,
      tried: tried.size,
    },
  };
}

/** The credit range across a wildcard's options; null when it has none. */
export function creditSpan(groups: readonly SectionGroup[]): Credits | null {
  let out: { min: number; max: number } | null = null;
  for (const g of groups) {
    const c = g.course.credits;
    out = out
      ? { min: Math.min(out.min, c.min), max: Math.max(out.max, c.max) }
      : { min: c.min, max: c.max };
  }
  return out;
}
