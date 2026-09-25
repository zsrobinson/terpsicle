import {
  type CourseCode,
  type Day,
  type Message,
  type MustHaves,
  type NearMiss,
  type NearMissConflict,
  type Relaxable,
  type SectionKey,
  sectionKey,
  type TravelSettings,
} from "../schema";
import { formatTime } from "../time/format";
import type { CampusMap } from "../travel/campus";
import type { SectionGroup } from "./candidates";
import {
  maxWalkMinutes,
  overlapBetween,
  type SolveVar,
  shortWalkBetween,
} from "./solve";

// When nothing fits (SPEC §3.9): the closest plans, each with what breaks.
// A branch-and-bound search over every section, including ones that break
// must-haves, that counts conflicts instead of rejecting them and keeps the
// few plans with the fewest. Like the main search, every pair of sections is
// checked once up front.

export type NearMissProblem = {
  readonly vars: readonly SolveVar[];
  readonly picks: readonly { readonly count: number }[];
  readonly mustHaves: MustHaves;
  readonly travel: TravelSettings | null;
  readonly campus: CampusMap;
  /** How many near-misses to return. */
  readonly keep: number;
  /** Plans with more conflicts than this aren't "near". */
  readonly maxConflicts: number;
  readonly maxSteps: number;
};

const repKey = (g: SectionGroup): SectionKey =>
  // biome-ignore lint/style/noNonNullAssertion: a group always has a first section
  sectionKey(g.course.code, g.sections[0]!.code);

const text = (t: string) => ({ kind: "text", text: t }) as const;
const section = (key: SectionKey) =>
  ({ kind: "section", sectionKey: key }) as const;
const course = (code: CourseCode) =>
  ({ kind: "course", courseCode: code }) as const;

const DAY_WORDS: Record<Day, string> = {
  M: "Mondays",
  Tu: "Tuesdays",
  W: "Wednesdays",
  Th: "Thursdays",
  F: "Fridays",
  Sa: "Saturdays",
  Su: "Sundays",
};

/** "CMSC351 0101 starts before 10am", and so on, for one must-have a section breaks. */
export function mustHaveMessage(
  key: SectionKey,
  constraint: Relaxable,
  mustHaves: MustHaves,
  group: SectionGroup,
): Message {
  switch (constraint) {
    case "earliest-start":
      return [
        section(key),
        text(` starts before ${formatTime(mustHaves.earliestStart ?? 0)}`),
      ];
    case "latest-end":
      return [
        section(key),
        text(` ends after ${formatTime(mustHaves.latestEnd ?? 0)}`),
      ];
    case "days-off": {
      const days = mustHaves.daysOff.filter((d) =>
        group.items.some((i) => i.day === d),
      );
      return [
        section(key),
        text(` meets on ${days.map((d) => DAY_WORDS[d]).join(" and ")}`),
      ];
    }
    case "open-seats-only":
      return [section(key), text(" is full")];
    case "respect-blocks":
      return [section(key), text(" overlaps one of your blocks")];
    default:
      return [section(key), text(" breaks a must-have")];
  }
}

const popcount = (x: number) => {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

const setBit = (bits: Uint32Array, i: number) => {
  bits[i >>> 5] = ((bits[i >>> 5] as number) | (1 << (i & 31))) >>> 0;
};

/** The conflicts in one plan, in words. */
function describe(
  groups: readonly SectionGroup[],
  problem: NearMissProblem,
  maxWalk: number | null,
): NearMissConflict[] {
  const { travel, campus, mustHaves } = problem;
  const conflicts: NearMissConflict[] = [];
  for (const g of groups) {
    const key = repKey(g);
    for (const constraint of g.violations)
      conflicts.push({
        kind: "must-have",
        constraint,
        sectionKeys: [key],
        message: mustHaveMessage(key, constraint, mustHaves, g),
      });
  }
  for (let x = 0; x < groups.length; x++)
    for (let y = x + 1; y < groups.length; y++) {
      const a = groups[x] as SectionGroup;
      const b = groups[y] as SectionGroup;
      const clash = overlapBetween(a, b);
      if (clash) {
        conflicts.push({
          kind: "overlap",
          sectionKeys: [repKey(a), repKey(b)],
          day: clash.day,
          message: [
            course(a.course.code),
            text(" and "),
            course(b.course.code),
            text(" overlap"),
          ],
        });
        continue;
      }
      const walk =
        travel && maxWalk !== null
          ? shortWalkBetween(a, b, travel, campus, maxWalk)
          : null;
      if (walk)
        conflicts.push({
          kind: "not-enough-time",
          sectionKeys: [walk.from.source.sectionKey, walk.to.source.sectionKey],
          day: walk.to.day,
          message: [
            text("Not enough time to get from "),
            course(walk.from.source.courseCode),
            text(" to "),
            course(walk.to.source.courseCode),
          ],
        });
    }
  return conflicts;
}

export function nearMisses(problem: NearMissProblem): NearMiss[] {
  const { vars, picks, campus, travel } = problem;
  const n = vars.length;
  const maxWalk = travel ? maxWalkMinutes(campus, travel) : null;

  // Each course's groups cheapest first, so good plans (and a tight bound) come early.
  const all: SectionGroup[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  for (const v of vars) {
    lo.push(all.length);
    all.push(
      ...[...v.groups].sort(
        (a, b) => a.violations.length - b.violations.length,
      ),
    );
    hi.push(all.length);
  }
  const words = Math.max(1, Math.ceil(all.length / 32));
  const varOf: number[] = [];
  vars.forEach((_, k) => {
    for (let i = lo[k] as number; i < (hi[k] as number); i++) varOf[i] = k;
  });
  const clashes = all.map(() => new Uint32Array(words));
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      if (varOf[i] === varOf[j]) continue;
      const a = all[i] as SectionGroup;
      const b = all[j] as SectionGroup;
      const clash =
        overlapBetween(a, b) !== null ||
        (travel !== null &&
          maxWalk !== null &&
          shortWalkBetween(a, b, travel, campus, maxWalk) !== null);
      if (!clash) continue;
      setBit(clashes[i] as Uint32Array, j);
      setBit(clashes[j] as Uint32Array, i);
    }

  const chosen = new Uint32Array(words);
  const choice: number[] = new Array(n).fill(-1);
  const pickCounts = picks.map(() => 0);
  const pickLeft = picks.map(() => 0);
  for (const v of vars)
    if (v.role.kind === "pick")
      pickLeft[v.role.group] = (pickLeft[v.role.group] ?? 0) + 1;
  const kept: { choice: number[]; cost: number }[] = [];
  let steps = 0;
  let cost = 0;
  let included = 0;

  // Once full, only plans strictly better than the worst kept one are worth finding.
  const bound = () =>
    kept.length < problem.keep
      ? problem.maxConflicts
      : Math.min(
          problem.maxConflicts,
          (kept.at(-1)?.cost ?? problem.maxConflicts) - 1,
        );

  const added = (i: number) => {
    const c = clashes[i] as Uint32Array;
    let pairs = 0;
    for (let w = 0; w < words; w++)
      pairs += popcount(((chosen[w] as number) & (c[w] as number)) >>> 0);
    return (all[i] as SectionGroup).violations.length + pairs;
  };

  const visit = (depth: number): void => {
    if (++steps > problem.maxSteps || cost > bound()) return;
    if (depth === n) {
      if (included === 0 || cost === 0) return;
      for (let p = 0; p < picks.length; p++)
        if (pickCounts[p] !== picks[p]?.count) return;
      kept.push({ choice: [...choice], cost });
      kept.sort((a, b) => a.cost - b.cost);
      if (kept.length > problem.keep) kept.pop();
      return;
    }
    const v = vars[depth] as SolveVar;
    const pick = v.role.kind === "pick" ? v.role.group : -1;
    if (pick >= 0) pickLeft[pick] = (pickLeft[pick] ?? 0) - 1;
    if (
      v.credits !== null &&
      (pick < 0 || (pickCounts[pick] ?? 0) < (picks[pick]?.count ?? 0))
    ) {
      for (let i = lo[depth] as number; i < (hi[depth] as number); i++) {
        const extra = added(i);
        if (cost + extra > bound()) continue;
        cost += extra;
        choice[depth] = i;
        setBit(chosen, i);
        included++;
        if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) + 1;
        visit(depth + 1);
        if (pick >= 0) pickCounts[pick] = (pickCounts[pick] ?? 0) - 1;
        included--;
        chosen[i >>> 5] =
          ((chosen[i >>> 5] as number) & ~(1 << (i & 31))) >>> 0;
        choice[depth] = -1;
        cost -= extra;
      }
    }
    const canSkip =
      v.role.kind === "optional" ||
      (pick >= 0 &&
        (pickCounts[pick] ?? 0) + (pickLeft[pick] ?? 0) >=
          (picks[pick]?.count ?? 0));
    if (canSkip) visit(depth + 1);
    if (pick >= 0) pickLeft[pick] = (pickLeft[pick] ?? 0) + 1;
  };
  visit(0);

  return kept.map(({ choice: picked }) => {
    const groups = picked.flatMap((i) =>
      i >= 0 ? [all[i] as SectionGroup] : [],
    );
    return {
      sections: groups.map(repKey),
      skipped: vars.flatMap((v, k) =>
        (picked[k] ?? -1) >= 0 ? [] : [v.courseCode],
      ),
      conflicts: describe(groups, problem, maxWalk),
    };
  });
}
