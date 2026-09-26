// The site's paths, and who skips the marketing page at `/` (docs/V2.md §2):
// anyone with a session, or with plans saved in this browser, goes straight
// to the scheduler; `/?stay` always shows the marketing page.

/** The scheduler. Share links, deep links and emails all point here. */
export const SCHEDULE_PATH = "/schedule";

/** The session cookie (docs/V2.md §4.3). `/` checks only that it's there. */
export const SESSION_COOKIE = "__Host-session";

/**
 * localStorage key the scheduler sets to "1" once this browser holds a plan,
 * so `/` can skip the marketing page before first paint.
 */
export const RETURNING_FLAG_KEY = "terpsicle:returning";

/** `/?stay`: the marketing page even for returning visitors ("About Terpsicle"). */
export const STAY_PARAM = "stay";

/** Whether a `Cookie` header carries a non-empty session cookie. */
export function hasSessionCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return false;
    return (
      pair.slice(0, eq).trim() === SESSION_COOKIE &&
      pair.slice(eq + 1).trim() !== ""
    );
  });
}

/** Whether a query string (`?stay`, `?a=1&stay=1`) asks to stay on `/`. */
export function wantsToStay(search: string): boolean {
  return new URLSearchParams(search).has(STAY_PARAM);
}

/**
 * The rule for `/`: any one signal skips the marketing page. `planCount` is
 * null when it hasn't been read (the flag or the cookie already decided).
 */
export function shouldSkipMarketing({
  hasSessionCookie,
  returningFlag,
  planCount,
}: {
  hasSessionCookie: boolean;
  returningFlag: boolean;
  planCount: number | null;
}): boolean {
  return hasSessionCookie || returningFlag || (planCount ?? 0) > 0;
}
