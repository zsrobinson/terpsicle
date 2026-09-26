import { addDays } from "../ics/dates";
import type { AcademicCalendar, IsoDate, TermId } from "../schema";
import type { FourYearTerm, FourYearTermStatus } from "../schema/four-year";

// Whether a column is done, in progress or planned (docs/V3.md §2.3). Derived
// from the academic calendar and today's date, never stored, so a plan moves
// on by itself when a semester ends.

/** Grades post and finals end within two weeks of the last day of classes. */
export const GRADES_GRACE_DAYS = 14;

/**
 * When the provost hasn't published a term's calendar: the months each season
 * usually runs, first day of classes through grades, as [month-day, month-day]
 * of the term's calendar year. Winter runs in the January after its id's year.
 */
const SEASON_SPAN = {
  "01": ["01-25", "05-31"],
  "05": ["06-01", "08-20"],
  "08": ["08-21", "12-31"],
  "12": ["01-01", "01-24"],
} as const;

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
  const code = termId.slice(4) as keyof typeof SEASON_SPAN;
  const year = Number(termId.slice(0, 4)) + (code === "12" ? 1 : 0);
  const [start, end] = SEASON_SPAN[code];
  return { start: `${year}-${start}`, end: `${year}-${end}` };
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
