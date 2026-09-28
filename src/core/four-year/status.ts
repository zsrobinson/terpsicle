import { termSpan } from "../catalog/terms";
import type { AcademicCalendar, IsoDate } from "../schema";
import type { FourYearTerm, FourYearTermStatus } from "../schema/four-year";

// Whether a column is done, in progress or planned (docs/V3.md §2.3). Derived
// from the academic calendar and today's date, never stored, so a plan moves
// on by itself when a semester ends.

export { GRADES_GRACE_DAYS, termSpan } from "../catalog/terms";

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
