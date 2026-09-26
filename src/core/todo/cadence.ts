import type { TodoFetchError } from "../schema";

// When a feed is fetched next (docs/V3.md §3.5). Pure: the server passes the
// time, and the random number for jitter.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A feed someone uses is fetched this often (the cron's own period). */
export const TODO_ACTIVE_INTERVAL_MS = 20 * MINUTE_MS;
/** A feed nobody has opened in two weeks, this often. */
export const TODO_IDLE_INTERVAL_MS = 6 * HOUR_MS;
/** Opened in the last this-many days counts as in use. */
export const TODO_ACTIVE_DAYS = 14;
/** Not opened in this many days (and no reminders): paused. */
export const TODO_PAUSE_DAYS = 120;
/** Backoff never waits longer than this. */
export const TODO_MAX_BACKOFF_MS = 12 * HOUR_MS;
/** `todo/refresh` fetches a feed at most this often. */
export const TODO_REFRESH_MIN_MS = 5 * MINUTE_MS;
/** Answers that mean ELMS stopped sharing the link; this many in a row break it. */
export const TODO_GONE_STRIKES = 3;
/** Gone answers closer together than this count once. */
export const TODO_GONE_SPACING_MS = HOUR_MS;
/** `todo/list` records an opening at most this often. */
export const TODO_OPENED_WRITE_MS = HOUR_MS;

export type NextFetch = { status: "active"; at: Date } | { status: "paused" };

/**
 * After a fetch that worked: 20 minutes for a feed in use (opened in the
 * last 14 days, or with "Due tomorrow" on), else 6 hours; paused once nobody
 * has opened it in 120 days and no reminder needs it.
 */
export function nextFetch(options: {
  now: Date;
  lastOpenedAt: Date;
  dueTomorrowOn: boolean;
}): NextFetch {
  const { now, lastOpenedAt, dueTomorrowOn } = options;
  const idleMs = now.getTime() - lastOpenedAt.getTime();
  if (!dueTomorrowOn && idleMs >= TODO_PAUSE_DAYS * DAY_MS)
    return { status: "paused" };
  const interval =
    dueTomorrowOn || idleMs < TODO_ACTIVE_DAYS * DAY_MS
      ? TODO_ACTIVE_INTERVAL_MS
      : TODO_IDLE_INTERVAL_MS;
  return { status: "active", at: new Date(now.getTime() + interval) };
}

/**
 * After the `failures`-th failure in a row: 20 min × 2^(failures − 1), at
 * most 12 hours, ±10% so failures don't bunch. `random` is in [0, 1).
 */
export function backoffMs(failures: number, random: number): number {
  const base = Math.min(
    TODO_ACTIVE_INTERVAL_MS * 2 ** Math.max(0, failures - 1),
    TODO_MAX_BACKOFF_MS,
  );
  return Math.round(base * (0.9 + 0.2 * random));
}

/** 401, 403, 404, 410: ELMS stopped sharing that link (reset feed, removed account). */
export function isGoneError(code: TodoFetchError): boolean {
  return ["http-401", "http-403", "http-404", "http-410"].includes(code);
}

export interface GoneStrikes {
  strikes: number;
  /** When the last strike counted. */
  at: Date | null;
}

/**
 * The strikes after a failure. A gone answer counts when it's at least an
 * hour after the last one that counted (so a burst of refreshes is one
 * strike); any other failure ends the run. The third breaks the feed.
 */
export function afterFailure(
  previous: GoneStrikes,
  code: TodoFetchError,
  now: Date,
): GoneStrikes & { broken: boolean } {
  if (!isGoneError(code)) return { strikes: 0, at: null, broken: false };
  const spaced =
    previous.at === null ||
    now.getTime() - previous.at.getTime() >= TODO_GONE_SPACING_MS;
  const next = spaced
    ? { strikes: previous.strikes + 1, at: now }
    : { strikes: previous.strikes, at: previous.at };
  return { ...next, broken: next.strikes >= TODO_GONE_STRIKES };
}
