import { termLabel } from "../catalog/terms";
import type { IsoDate, TermId } from "../schema";
import type {
  FourYearDoc,
  FourYearEntry,
  FourYearTerm,
  FourYearTermStatus,
} from "../schema/four-year";

// A four-year plan's columns (docs/V3.md §2.1): "Before UMD", eight fall and
// spring semesters from `firstTermId`, and any other term (a summer, a
// winter, a semester past the eighth) that has an entry.

/** How many fall and spring semesters a plan shows. */
export const FOUR_YEAR_SEMESTERS = 8;

/** Column order: "Before UMD" first, then by term id (ids sort by date). */
export function compareFourYearTerms(a: FourYearTerm, b: FourYearTerm): number {
  if (a === b) return 0;
  if (a === "before") return -1;
  if (b === "before") return 1;
  return a < b ? -1 : 1;
}

/** Fall or spring: the terms a plan always shows and full time is judged on. */
export function isSemester(term: FourYearTerm): term is TermId {
  return term !== "before" && (term.endsWith("01") || term.endsWith("08"));
}

/** The next fall or spring after a term: Fall 2026 → Spring 2027, Summer 2027 → Fall 2027. */
export function nextSemester(termId: TermId): TermId {
  const year = Number(termId.slice(0, 4));
  return termId.endsWith("01") || termId.endsWith("05")
    ? `${year}08`
    : `${year + 1}01`;
}

/** The fall or spring before a term: Spring 2027 → Fall 2026, Summer 2027 → Spring 2027. */
export function previousSemester(termId: TermId): TermId {
  const year = Number(termId.slice(0, 4));
  if (termId.endsWith("01")) return `${year - 1}08`;
  return termId.endsWith("12") ? `${year}08` : `${year}01`;
}

/** `count` fall and spring semesters from `firstTermId` (or from the next one, if it's a summer or winter). */
export function semesterIds(
  firstTermId: TermId,
  count: number = FOUR_YEAR_SEMESTERS,
): TermId[] {
  const out: TermId[] = [];
  let term = isSemester(firstTermId) ? firstTermId : nextSemester(firstTermId);
  while (out.length < count) {
    out.push(term);
    term = nextSemester(term);
  }
  return out;
}

/** Every column the doc shows, in order. */
export function fourYearColumns(
  doc: Pick<FourYearDoc, "firstTermId" | "entries">,
): FourYearTerm[] {
  const terms = new Set<FourYearTerm>([
    "before",
    ...semesterIds(doc.firstTermId),
  ]);
  for (const entry of doc.entries) terms.add(entry.term);
  return [...terms].sort(compareFourYearTerms);
}

/** "Before UMD", "Fall 2026". */
export function fourYearTermLabel(term: FourYearTerm): string {
  return term === "before" ? "Before UMD" : termLabel(term);
}

/** A column's entries, in position order. */
export function entriesInTerm(
  doc: Pick<FourYearDoc, "entries">,
  term: FourYearTerm,
): FourYearEntry[] {
  return doc.entries.filter((e) => e.term === term);
}

/** The earliest fall or spring among some terms; null when there's none. */
export function firstSemesterOf(terms: Iterable<FourYearTerm>): TermId | null {
  let first: TermId | null = null;
  for (const term of terms)
    if (isSemester(term) && (first === null || term < first)) first = term;
  return first;
}

/** The strip's short name: "Before", "Fa 2026", "Wi 2027". */
export function fourYearTermShortLabel(term: FourYearTerm): string {
  if (term === "before") return "Before";
  const [season, year] = termLabel(term).split(" ");
  return season && year ? `${season.slice(0, 2)} ${year}` : term;
}

/**
 * The academic year a term belongs to, by the year its fall starts: Fall
 * 2026, Winter 2027, Spring 2027 and Summer 2027 are all 2026.
 */
export function academicYearOf(termId: TermId): number {
  const year = Number(termId.slice(0, 4));
  return termId.endsWith("08") || termId.endsWith("12") ? year : year - 1;
}

/** "2026–27". */
export function academicYearLabel(year: number): string {
  return `${year}–${String((year + 1) % 100).padStart(2, "0")}`;
}

/**
 * A new plan's first semester: most people start in a fall, so the fall of
 * the school year you're in, or the coming one from May on (someone
 * admitted in spring plans over the summer).
 */
export function defaultFirstTerm(today: IsoDate): TermId {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return `${month >= 5 ? year : year - 1}08`;
}

/**
 * What "I started in" offers: falls and springs from six years back
 * (a fifth year, or a return after time off) to the coming fall.
 */
export function firstTermChoices(today: IsoDate): TermId[] {
  const newest = defaultFirstTerm(today);
  const oldest = `${Number(newest.slice(0, 4)) - 6}08`;
  const out: TermId[] = [];
  for (let term: TermId = oldest; term <= newest; term = nextSemester(term))
    out.push(term);
  return out.reverse();
}

/**
 * Where a course goes when no semester is picked: the one in progress, else
 * the first planned one, else the last column.
 */
export function defaultTargetTerm(
  columns: readonly FourYearTerm[],
  statusOf: (term: FourYearTerm) => FourYearTermStatus,
): FourYearTerm {
  const terms = columns.filter((t) => t !== "before");
  return (
    terms.find((t) => statusOf(t) === "in-progress") ??
    terms.find((t) => statusOf(t) === "planned") ??
    terms[terms.length - 1] ??
    "before"
  );
}
