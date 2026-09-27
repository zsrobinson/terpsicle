import { seasonSpan, seasonTermOf } from "../catalog/terms";
import type { IsoDate, TermId } from "../schema";

// The terms a review can say you took the class in: the one under way and
// the ones before it. Worked out from the date rather than the catalog's
// term list, which leads with the term people are registering for (a future
// one) and can skip the current one.

/** Four years of terms: a degree's worth. */
const REVIEW_TERM_COUNT = 16;

/** The term before this one: fall, summer, spring, winter, fall, … */
function previousTerm(termId: TermId): TermId {
  const year = Number(termId.slice(0, 4));
  switch (termId.slice(4)) {
    case "08":
      return `${year}05`;
    case "05":
      return `${year}01`;
    case "01":
      return `${year - 1}12`;
    default:
      return `${year}08`;
  }
}

/** Whether a term's classes have begun by `today` (by its usual months). */
export function hasTermStarted(termId: TermId, today: IsoDate): boolean {
  return seasonSpan(termId).start <= today;
}

/** "When you took it": the current term, then earlier ones, newest first. */
export function reviewTermChoices(
  today: IsoDate,
  count = REVIEW_TERM_COUNT,
): TermId[] {
  const terms: TermId[] = [];
  let termId = seasonTermOf(today);
  while (terms.length < count) {
    terms.push(termId);
    termId = previousTerm(termId);
  }
  return terms;
}
