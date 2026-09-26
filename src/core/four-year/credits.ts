import type { Grade, LocalId } from "../schema";
import type {
  FourYearDoc,
  FourYearEntry,
  FourYearTerm,
} from "../schema/four-year";
import { type FourYearCourses, isRepeatable } from "./course-lookup";
import type { StatusOf } from "./status";
import { entriesInTerm } from "./terms";

// Credits (docs/V3.md §2.6): earned, in progress and planned, against 120.

/** Most UMD degrees need 120 credits. */
export const CREDITS_GOAL = 120;

/** Full time at UMD, for `light-semester`. */
export const FULL_TIME_CREDITS = 12;

export const CREDITS_GOAL_TOOLTIP =
  "Most UMD degrees need 120 credits. Yours may need more; your degree audit has the number.";

/**
 * Grades that earn no credit: F and XF, and the ones that aren't a result
 * yet or never are (incomplete, no grade reported, audit).
 */
export const NO_CREDIT_GRADES: ReadonlySet<Grade> = new Set<Grade>([
  "F",
  "XF",
  "I",
  "NG",
  "AUD",
]);

/**
 * An entry's credits: a course's index credits (the entry's own for a
 * variable-credit course, or its minimum until one is set), a placeholder's
 * or a credit entry's own. A course whose department hasn't loaded counts 0
 * until it does.
 */
export function entryCredits(
  entry: FourYearEntry,
  lookup: FourYearCourses,
): number {
  if (entry.kind !== "course") return entry.credits;
  return entry.credits ?? lookup.courses.get(entry.code)?.credits.min ?? 0;
}

/**
 * Course entries a later attempt replaces: a course taken twice counts once,
 * the later attempt, unless Testudo says it's repeatable.
 */
export function supersededAttempts(
  doc: Pick<FourYearDoc, "entries">,
  lookup: FourYearCourses,
): Set<LocalId> {
  const latest = new Map<string, LocalId>();
  const out = new Set<LocalId>();
  // Entries are in column order, so a later one is a later attempt.
  for (const entry of doc.entries) {
    if (entry.kind !== "course") continue;
    const course = lookup.courses.get(entry.code);
    if (course && isRepeatable(course)) continue;
    const earlier = latest.get(entry.code);
    if (earlier !== undefined) out.add(earlier);
    latest.set(entry.code, entry.id);
  }
  return out;
}

/** Whether a finished entry's grade earned nothing. */
export function earnedNothing(
  doc: Pick<FourYearDoc, "grades">,
  entry: FourYearEntry,
): boolean {
  const grade = doc.grades[entry.id];
  return grade !== undefined && NO_CREDIT_GRADES.has(grade);
}

/**
 * Entries that count toward credits and GenEds: all but attempts a later
 * one replaces and finished courses whose grade earned nothing.
 */
export function countedEntries(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  lookup: FourYearCourses,
  statusOf: StatusOf,
): FourYearEntry[] {
  const superseded = supersededAttempts(doc, lookup);
  return doc.entries.filter(
    (e) =>
      !superseded.has(e.id) &&
      !(statusOf(e.term) === "done" && earnedNothing(doc, e)),
  );
}

export type CreditTotals = {
  /** Done terms and "Before UMD". */
  readonly earned: number;
  readonly inProgress: number;
  readonly planned: number;
  /** All three: the header's "99 of 120 credits". */
  readonly total: number;
};

function round(x: number): number {
  return Math.round(x * 10) / 10;
}

export function creditTotals(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  lookup: FourYearCourses,
  statusOf: StatusOf,
): CreditTotals {
  const sums = { done: 0, "in-progress": 0, planned: 0 };
  for (const entry of countedEntries(doc, lookup, statusOf))
    sums[statusOf(entry.term)] += entryCredits(entry, lookup);
  const earned = round(sums.done);
  const inProgress = round(sums["in-progress"]);
  const planned = round(sums.planned);
  return {
    earned,
    inProgress,
    planned,
    total: round(earned + inProgress + planned),
  };
}

/** "99 of 120 credits". */
export function creditsHeadline(totals: Pick<CreditTotals, "total">): string {
  return `${totals.total} of ${CREDITS_GOAL} credits`;
}

export type ColumnSummary = {
  readonly entries: number;
  readonly credits: number;
};

/** What a column holds, as it shows: every block, at its credits. */
export function columnSummary(
  doc: Pick<FourYearDoc, "entries">,
  term: FourYearTerm,
  lookup: FourYearCourses,
): ColumnSummary {
  const entries = entriesInTerm(doc, term);
  return {
    entries: entries.length,
    credits: round(entries.reduce((n, e) => n + entryCredits(e, lookup), 0)),
  };
}

/** "5 courses · 15 cr", "1 course · 3 cr". */
export function columnLabel({ entries, credits }: ColumnSummary): string {
  return `${entries} ${entries === 1 ? "course" : "courses"} · ${credits} cr`;
}
