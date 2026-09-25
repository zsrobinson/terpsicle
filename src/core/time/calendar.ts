import { DAYS, type Day, type Minutes } from "../schema";

// Calendar grid extent (SPEC §3.3): hours fit the plan, never less than
// 8am–5pm; Saturday and Sunday columns appear only when something meets then.

export const MIN_CALENDAR_START: Minutes = 8 * 60;
export const MIN_CALENDAR_END: Minutes = 17 * 60;

export type HourRange = {
  /** On the hour, minutes since midnight. */
  readonly start: Minutes;
  /** On the hour, minutes since midnight. */
  readonly end: Minutes;
};

/**
 * The hours the grid shows: at least 8am–5pm, grown out to whole hours so
 * every item fits.
 */
export function calendarHourRange(
  items: Iterable<{ start: number; end: number }>,
): HourRange {
  let start = MIN_CALENDAR_START;
  let end = MIN_CALENDAR_END;
  for (const item of items) {
    start = Math.min(start, Math.floor(item.start / 60) * 60);
    end = Math.max(end, Math.ceil(item.end / 60) * 60);
  }
  return { start, end: Math.min(end, 24 * 60) };
}

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];

/** Monday–Friday, plus Saturday and/or Sunday only when an item needs them. */
export function calendarDays(items: Iterable<{ day: Day }>): Day[] {
  let saturday = false;
  let sunday = false;
  for (const item of items) {
    if (item.day === "Sa") saturday = true;
    else if (item.day === "Su") sunday = true;
  }
  return DAYS.filter(
    (d) =>
      WEEKDAYS.includes(d) ||
      (d === "Sa" && saturday) ||
      (d === "Su" && sunday),
  );
}
