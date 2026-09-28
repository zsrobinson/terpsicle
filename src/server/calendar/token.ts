// The calendar feed's link (docs/V2.md §6.7). The token is a secret, like
// the ELMS link: it never goes into D1, a log, an error or analytics.
//
// token = HMAC-SHA-256(R2 key, "calendar-feed:v1:<userId>:<nonce>"), hex.
// D1 keeps the nonce and SHA-256(token). So:
// - Settings can show the same link again (derive it from the row), which
//   keeps calendars subscribed to it working;
// - a copy of D1 alone gives neither a token nor a way to make one (the key
//   is in R2 under _jobs/, never served), and the hash can't be reversed
//   (256 random-looking bits);
// - "Make a new link" draws a new nonce: a new token and hash, and the old
//   link matches nothing.
import { CALENDAR_FEED_TOKEN_PATTERN } from "~/core/schema/calendar-feed";
import { keyedHash, randomToken, sha256Hex } from "../crypto";

/** Where feeds are served: `/cal/<token>.ics`. */
export const CALENDAR_FEED_PREFIX = "/cal/";

/** A fresh nonce: 16 random bytes, base64url. */
export function newFeedNonce(): string {
  return randomToken(16);
}

/** The link's token for a person and nonce. */
export function feedToken(
  bucket: R2Bucket,
  userId: string,
  nonce: string,
): Promise<string> {
  return keyedHash(bucket, `calendar-feed:v1:${userId}:${nonce}`);
}

/** What D1 matches a request by. */
export function feedTokenHash(token: string): Promise<string> {
  return sha256Hex(token);
}

/** The link: `https://terpsicle.com/cal/<token>.ics` on the asking origin. */
export function feedUrl(origin: string, token: string): string {
  return `${origin}${CALENDAR_FEED_PREFIX}${token}.ics`;
}

/** The token in a `/cal/<token>.ics` path, or null when it isn't one. */
export function tokenFromPath(pathname: string): string | null {
  if (!pathname.startsWith(CALENDAR_FEED_PREFIX)) return null;
  const file = pathname.slice(CALENDAR_FEED_PREFIX.length);
  if (!file.endsWith(".ics")) return null;
  const token = file.slice(0, -".ics".length);
  return CALENDAR_FEED_TOKEN_PATTERN.test(token) ? token : null;
}
