// Time helpers for source text. UMD's times are America/New_York wall-clock;
// we publish UTC instants and plain local dates (DATA.md §1).

const ZONE = "America/New_York";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

/** Offset of New York from UTC at `utcMs`, in minutes (−240 in summer). */
function zoneOffsetMinutes(utcMs: number): number {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(utcMs))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
  );
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** A New York wall-clock time → UTC ISO string. */
export function easternToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset even next to a DST change.
  let utc = naive - zoneOffsetMinutes(naive) * 60000;
  utc = naive - zoneOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

/** "09/24/2026 at 10:30 PM" (Testudo's seats stamp) → UTC ISO, or null. */
export function parseSeatsStamp(text: string | null): string | null {
  if (!text) return null;
  const m =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(
      text.trim(),
    );
  if (!m) return null;
  const [, mo, d, y, h, mi, ap] = m;
  let hour = Number(h) % 12;
  if (ap?.toUpperCase() === "PM") hour += 12;
  return easternToIso(Number(y), Number(mo), Number(d), hour, Number(mi));
}

export const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** "March 1, 2027" → "2027-03-01", or null. */
export function parseLongDate(text: string | null): string | null {
  if (!text) return null;
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(
    (m[1] ?? "").toLowerCase() as (typeof MONTHS)[number],
  );
  if (month < 0) return null;
  return isoDate(Number(m[3]), month + 1, Number(m[2]));
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "1:00pm" → 780; null when it isn't a clock time. */
export function parseClock(text: string | null): number | null {
  if (!text) return null;
  const m = /^(\d{1,2}):(\d{2})\s*([ap])m$/i.exec(text.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3]?.toLowerCase() === "p";
  return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
}
