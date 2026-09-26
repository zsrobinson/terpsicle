import { termLabel } from "../catalog/terms";
import type { TermId } from "../schema";
import type {
  FourYearDoc,
  FourYearEntry,
  FourYearTerm,
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
