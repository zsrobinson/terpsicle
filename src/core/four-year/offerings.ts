import {
  type OfferingSummary,
  offeredTermsIn,
  offeringSummary,
} from "../history/offering-pattern";
import type { CourseCode, DeptCode, TermId } from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import type { HistoryDept } from "../schema/history";
import type { FourYearCourses } from "./course-lookup";

// When a plan's courses usually run (docs/decisions.md, "Offering patterns
// from the history"): each course's offering pattern, from the instructor
// history merged with the course index, for `unlikely-term`.

export type CourseOffering = {
  readonly summary: OfferingSummary;
  /** Every term it ran in: the history's, and the index's (Testudo's) terms. */
  readonly offered: ReadonlySet<TermId>;
};

export type FourYearOfferings = {
  /** Terms Testudo lists now: their catalogs are facts, not patterns. */
  readonly listed: ReadonlySet<TermId>;
  /** Every term on record: the history's and the listed ones. */
  readonly recorded: ReadonlySet<TermId>;
  /** The newest term Testudo lists, where the patterns' window ends. */
  readonly now: TermId;
  readonly courses: ReadonlyMap<CourseCode, CourseOffering>;
};

/** A course and its cross-listings, the codes one course's record is under. */
export function offeringCodes(
  lookup: FourYearCourses,
  code: CourseCode,
): CourseCode[] {
  return [code, ...(lookup.courses.get(code)?.crossListings ?? [])];
}

/** The departments a doc's offering patterns read: its courses' and their cross-listings'. */
export function offeringDepts(
  doc: Pick<FourYearDoc, "entries">,
  lookup: FourYearCourses,
): DeptCode[] {
  const depts = new Set<DeptCode>();
  for (const entry of doc.entries)
    if (entry.kind === "course")
      for (const code of offeringCodes(lookup, entry.code))
        depts.add(code.slice(0, 4));
  return [...depts].sort();
}

/**
 * Each of the doc's courses the index knows, with its pattern. `history`
 * holds the departments' files (`offeringDepts`); `recorded` is every term
 * the history covers. Testudo's listed terms count as on record too: the
 * index has their whole catalogs.
 */
export function fourYearOfferings(input: {
  readonly doc: Pick<FourYearDoc, "entries">;
  readonly lookup: FourYearCourses;
  readonly history: ReadonlyMap<DeptCode, HistoryDept>;
  readonly recorded: ReadonlySet<TermId>;
  readonly listed: ReadonlySet<TermId>;
  readonly now: TermId;
}): FourYearOfferings {
  const { doc, lookup, history, listed, now } = input;
  const recorded = new Set([...input.recorded, ...listed]);
  const courses = new Map<CourseCode, CourseOffering>();
  for (const entry of doc.entries) {
    if (entry.kind !== "course" || courses.has(entry.code)) continue;
    if (!lookup.courses.has(entry.code)) continue;
    const codes = offeringCodes(lookup, entry.code);
    const offered = offeredTermsIn(history, codes);
    for (const code of codes)
      for (const term of lookup.courses.get(code)?.offered ?? [])
        offered.add(term);
    courses.set(entry.code, {
      summary: offeringSummary({ offered, recorded, now }),
      offered,
    });
  }
  return { listed, recorded, now, courses };
}
