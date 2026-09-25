// "Seats as of 2 min ago" (SPEC §3.4). `now` is always passed in.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function toMillis(t: string | number | Date): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") return Date.parse(t);
  return t.getTime();
}

/**
 * How long ago `then` was, relative to `now`: "just now", "2 min ago",
 * "3 hr ago", "yesterday", "4 days ago". A `then` slightly in the future
 * (clock skew between us and Testudo) reads as "just now".
 */
export function formatRelative(
  then: string | number | Date,
  now: string | number | Date,
): string {
  const diff = toMillis(now) - toMillis(then);
  if (Number.isNaN(diff)) return "";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
  const days = Math.floor(diff / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
