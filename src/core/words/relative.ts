import { campusDate, formatShortDate } from "../time/format";

// How long ago something happened, in one set of words for every product
// (the owner, 2026-09-28: "stick with '3 hours ago'"): "just now", "1 minute
// ago", "3 hours ago", "yesterday", "3 days ago", then the date. Days are
// College Park's, as in Chat and the bell. `now` is always passed in.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Past this many campus days, `relativeWords` gives the date instead. */
const DAYS_IN_WORDS = 6;

type Instant = string | number | Date;

function toMillis(t: Instant): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") return Date.parse(t);
  return t.getTime();
}

function unit(n: number, one: string): string {
  return `${n} ${n === 1 ? one : `${one}s`}`;
}

/**
 * A span of time in its largest whole unit, rounded down: "1 minute", "25
 * minutes", "3 hours", "2 days". Rounding down never claims more time than
 * has passed (or is left). Under a minute it's "less than a minute".
 */
export function spanWords(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  return unit(Math.floor(hours / 24), "day");
}

/**
 * How long ago `then` was, from `now`: "just now" under a minute, "3 minutes
 * ago" and "3 hours ago" under a day, then by College Park's calendar
 * "yesterday" and "3 days ago", and past six days the date ("Sep 21", with
 * the year when it isn't this one). A `then` in the future (clock skew
 * between us and a server) reads as "just now". Empty for a bad date.
 */
export function relativeWords(then: Instant, now: Instant): string {
  const thenMs = toMillis(then);
  const nowMs = toMillis(now);
  const diff = nowMs - thenMs;
  if (Number.isNaN(diff)) return "";
  if (diff < MINUTE_MS) return "just now";
  if (diff < DAY_MS) return `${spanWords(diff)} ago`;
  const thenDay = campusDate(new Date(thenMs).toISOString());
  const nowDay = campusDate(new Date(nowMs).toISOString());
  const days = Math.round((Date.parse(nowDay) - Date.parse(thenDay)) / DAY_MS);
  if (days <= 1) return "yesterday";
  if (days <= DAYS_IN_WORDS) return `${days} days ago`;
  const date = formatShortDate(thenDay);
  return thenDay.slice(0, 4) === nowDay.slice(0, 4)
    ? date
    : `${date}, ${thenDay.slice(0, 4)}`;
}
