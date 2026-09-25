import type { Day, IsoDate } from "../schema";

// Calendar-date arithmetic for .ics export, on UTC-midnight timestamps so
// daylight saving never shifts a date.

const DAY_MS = 86_400_000;

export function parseIsoDate(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function formatIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(parseIsoDate(date) + days * DAY_MS);
}

const WEEKDAY: readonly Day[] = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];

export function weekdayOf(date: IsoDate): Day {
  return WEEKDAY[new Date(parseIsoDate(date)).getUTCDay()] ?? "M";
}

/** Every date from `start` to `end`, inclusive. */
export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (
    let t = parseIsoDate(start), last = parseIsoDate(end);
    t <= last;
    t += DAY_MS
  )
    out.push(formatIsoDate(t));
  return out;
}

/** The date of the `n`th (1-based) Sunday of a month. */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + 7 * (n - 1);
}

/**
 * America/New_York's UTC offset in minutes (−240 in EDT, −300 in EST) at a
 * local date and time, by the US rule in force since 2007: daylight time from
 * 2am on the second Sunday of March to 2am on the first Sunday of November.
 * The same rule is in the exported VTIMEZONE.
 */
export function easternOffsetMinutes(date: IsoDate, minutes: number): number {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  const dstStart = nthSunday(y, 3, 2);
  const dstEnd = nthSunday(y, 11, 1);
  const afterStart =
    m > 3 || (m === 3 && (d > dstStart || (d === dstStart && minutes >= 120)));
  const beforeEnd =
    m < 11 || (m === 11 && (d < dstEnd || (d === dstEnd && minutes < 120)));
  return afterStart && beforeEnd ? -240 : -300;
}

/** A local America/New_York date and time as a UTC epoch millisecond. */
export function easternToUtc(date: IsoDate, minutes: number): number {
  return (
    parseIsoDate(date) +
    (minutes - easternOffsetMinutes(date, minutes)) * 60_000
  );
}
