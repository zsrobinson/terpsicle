// Session and account timing (docs/V2.md §4.3, §4.7). Every function takes
// `now`; the Worker supplies it.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A session lasts this long after it was last refreshed (sliding). */
export const SESSION_TTL_MS = 30 * DAY;
/** A session seen longer ago than this is refreshed with a new token. */
export const SESSION_REFRESH_AFTER_MS = DAY;
/**
 * How long a replaced token keeps working, so a second tab that sent the old
 * cookie a moment before the new one arrived isn't signed out.
 */
export const REPLACED_GRACE_MS = MINUTE;
/** The Google round trip's `__Host-oauth` cookie. */
export const OAUTH_FLOW_TTL_MS = 10 * MINUTE;
/** Between "Delete account" and the purge: signing in before then keeps it. */
export const DELETION_GRACE_MS = 7 * DAY;

export type SessionState = "valid" | "refresh" | "expired";

/** When a session refreshed at `now` expires. */
export function sessionExpiresAt(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

/** When a replaced token stops working: soon, and never later than before. */
export function replacedExpiresAt(expiresAt: Date, now: Date): Date {
  return new Date(
    Math.min(expiresAt.getTime(), now.getTime() + REPLACED_GRACE_MS),
  );
}

/**
 * Whether a session still works, and whether it's due for its daily refresh
 * (a new token and 30 more days: at most one write a day per session).
 */
export function sessionState(
  session: { lastSeenAt: Date; expiresAt: Date },
  now: Date,
): SessionState {
  if (now.getTime() >= session.expiresAt.getTime()) return "expired";
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_REFRESH_AFTER_MS)
    return "refresh";
  return "valid";
}

/** When an account deleted at `now` is purged. */
export function deleteAfter(now: Date): Date {
  return new Date(now.getTime() + DELETION_GRACE_MS);
}
