import { easternOffsetMinutes } from "../ics/dates";
import type { IsoDate } from "../schema";

// Wall-clock times in a feed's time zones as instants, and instants as New
// York dates. New York, the zone nearly every ELMS item is in, uses the same
// hand-kept US rule as the .ics export, so it doesn't depend on the runtime's
// time zone data. Other zones (a dropped file from elsewhere) go through Intl.

export const NEW_YORK = "America/New_York";

/** Names calendar apps write for a zone instead of its IANA id (Outlook's Windows names). */
const ZONE_ALIASES: Readonly<Record<string, string>> = {
  "eastern standard time": NEW_YORK,
  "us/eastern": NEW_YORK,
  est5edt: NEW_YORK,
  "central standard time": "America/Chicago",
  "us/central": "America/Chicago",
  "mountain standard time": "America/Denver",
  "us/mountain": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  "us/pacific": "America/Los_Angeles",
  utc: "UTC",
  gmt: "UTC",
  "etc/utc": "UTC",
  z: "UTC",
};

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  let formatter = formatters.get(zone);
  if (formatter === undefined) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      formatter = null;
    }
    formatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * The IANA zone a TZID names, or null when we can't place it. Accepts IANA
 * ids, a few common aliases, and the `/vendor/…/Area/City` global form.
 */
export function resolveZone(tzid: string): string | null {
  const trimmed = tzid.trim().replace(/^"|"$/g, "");
  const alias = ZONE_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const id = trimmed.startsWith("/")
    ? trimmed.split("/").filter(Boolean).slice(-2).join("/")
    : trimmed;
  if (id === NEW_YORK) return NEW_YORK;
  const formatter = formatterFor(id);
  return formatter ? formatter.resolvedOptions().timeZone : null;
}

/** The zone's UTC offset in minutes at an instant, from Intl. */
function intlOffsetMinutes(ms: number, formatter: Intl.DateTimeFormat): number {
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms)))
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
}

function isoDateOf(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function minutesOf(ms: number): number {
  return Math.floor((((ms % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS);
}

/**
 * A wall-clock time in `zone` as a UTC epoch millisecond, by RFC 5545 §3.3.5:
 * a time that happens twice (the hour after daylight time ends) is the first
 * one; a time that doesn't exist (the hour daylight time skips) is read with
 * the offset from before the gap. `local` is the wall time as if it were UTC.
 */
export function zonedToUtc(local: number, zone: string): number | null {
  if (zone === "UTC") return local;
  if (zone === NEW_YORK) {
    const date = isoDateOf(local);
    const minutes = minutesOf(local);
    let offset = easternOffsetMinutes(date, minutes);
    // In the skipped hour, the rule already says daylight time; RFC 5545
    // wants the standard offset from before the gap.
    if (offset === -240 && easternOffsetMinutes(date, minutes - 60) === -300)
      offset = -300;
    return local - offset * MINUTE_MS;
  }
  const formatter = formatterFor(zone);
  if (!formatter) return null;
  // Two passes find the offset in force at the answer. When they disagree the
  // time is in a gap or an overlap; the larger offset gives the earlier
  // instant for an overlap and the pre-gap reading for a gap.
  const first = intlOffsetMinutes(local, formatter);
  const guess = local - first * MINUTE_MS;
  const second = intlOffsetMinutes(guess, formatter);
  if (first === second) return guess;
  const candidates = [first, second]
    .map((offset) => local - offset * MINUTE_MS)
    .filter(
      (ms) => ms + intlOffsetMinutes(ms, formatter) * MINUTE_MS === local,
    );
  if (candidates.length > 0) return Math.min(...candidates);
  return local - Math.min(first, second) * MINUTE_MS;
}

/** The America/New_York date of an instant, by the same rule as `zonedToUtc`. */
export function newYorkDateOf(ms: number): IsoDate {
  for (const offset of [-300, -240]) {
    const local = ms + offset * MINUTE_MS;
    if (easternOffsetMinutes(isoDateOf(local), minutesOf(local)) === offset)
      return isoDateOf(local);
  }
  // The repeated hour after daylight time ends, read as standard time.
  return isoDateOf(ms - 300 * MINUTE_MS);
}
