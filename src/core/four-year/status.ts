import { seasonSpan } from "../catalog/terms";
import { addDays } from "../ics/dates";
import type { AcademicCalendar, IsoDate, TermId } from "../schema";
import type { FourYearTerm, FourYearTermStatus } from "../schema/four-year";

// Whether a column is done, in progress or planned (docs/V3.md §2.3). Derived
// from the academic calendar and today's date, never stored, so a plan moves
// on by itself when a semester ends.

/** Grades post and finals end within two weeks of the last day of classes. */
export const GRADES_GRACE_DAYS = 14;

/** A term's span: first day of classes through the end of the grace period. */
export function termSpan(
  termId: TermId,
  calendars: readonly AcademicCalendar[],
): { start: IsoDate; end: IsoDate } {
  const calendar = calendars.find((c) => c.termId === termId);
  if (calendar?.status === "published")
    return {
      start: calendar.classesStart,
      end: addDays(calendar.classesEnd, GRADES_GRACE_DAYS),
    };
  return seasonSpan(termId);
}

/** "Before UMD" is always done. */
export function termStatus(
  term: FourYearTerm,
  today: IsoDate,
  calendars: readonly AcademicCalendar[],
): FourYearTermStatus {
  if (term === "before") return "done";
  const { start, end } = termSpan(term, calendars);
  if (today < start) return "planned";
  if (today > end) return "done";
  return "in-progress";
}

export type StatusOf = (term: FourYearTerm) => FourYearTermStatus;

/** `termStatus` for one day and set of calendars, remembered per term. */
export function statusResolver(
  today: IsoDate,
  calendars: readonly AcademicCalendar[],
): StatusOf {
  const known = new Map<FourYearTerm, FourYearTermStatus>();
  return (term) => {
    let status = known.get(term);
    if (status === undefined) {
      status = termStatus(term, today, calendars);
      known.set(term, status);
    }
    return status;
  };
}
