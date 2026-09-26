import { addDays, easternToUtc } from "../ics/dates";
import type { AcademicCalendar, Term } from "../schema";

// How long a course's chat lives (V2.md §8.4): rooms turn read-only 10 days
// after the term's last day of classes, and everything is deleted 60 days
// after that. There's no export at launch.

/** Days after the last day of classes that rooms stay writable. */
export const CHAT_WRITABLE_DAYS_AFTER_CLASSES = 10;
/** Days a read-only course's chat is kept before it's deleted. */
export const CHAT_READABLE_DAYS = 60;

const DAY_MS = 86_400_000;

export type ChatRetention = {
  /** Epoch ms when rooms turn read-only. */
  readonly readOnlyAt: number;
  /** Epoch ms when the object's storage and the course's D1 rows are deleted. */
  readonly deleteAt: number;
};

/**
 * When a course's chat turns read-only and is deleted: from the published
 * calendar (midnight in College Park after the 10th day past the last day
 * of classes), or, when the calendar isn't published, from `now` once
 * Testudo has dropped the term (archived). Null while neither is known yet;
 * the object asks again later.
 */
export function chatRetention(
  calendar: AcademicCalendar | null,
  term: Term | null,
  now: number,
): ChatRetention | null {
  let readOnlyAt: number | null = null;
  if (calendar?.status === "published")
    readOnlyAt = easternToUtc(
      addDays(calendar.classesEnd, CHAT_WRITABLE_DAYS_AFTER_CLASSES + 1),
      0,
    );
  else if (term?.status === "archived") readOnlyAt = now;
  if (readOnlyAt === null) return null;
  return { readOnlyAt, deleteAt: readOnlyAt + CHAT_READABLE_DAYS * DAY_MS };
}
