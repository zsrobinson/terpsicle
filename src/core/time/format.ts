import {
  DAYS,
  type DateSpan,
  type Day,
  type IsoDate,
  type Minutes,
} from "../schema";

// Clock and day formatting in the prototype's style: "9:30am", "11am–12:15pm", "MWF".

/** "9:30am", "11am", "12pm", "12:05am". */
export function formatTime(minutes: Minutes): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? "am" : "pm";
  return m === 0
    ? `${h12}${suffix}`
    : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "11am–12:15pm". The en dash matches the prototype. */
export function formatTimeRange(start: Minutes, end: Minutes): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/**
 * "11am to 12:15pm": for accessible names. Screen readers skip or misread
 * the en dash in `formatTimeRange`.
 */
export function spokenTimeRange(start: Minutes, end: Minutes): string {
  return `${formatTime(start)} to ${formatTime(end)}`;
}

/** Testudo's compact day string: "MWF", "TuTh". */
export function formatDays(days: readonly Day[]): string {
  return sortDays(days).join("");
}

export const DAY_SHORT_NAMES = {
  M: "Mon",
  Tu: "Tue",
  W: "Wed",
  Th: "Thu",
  F: "Fri",
  Sa: "Sat",
  Su: "Sun",
} as const satisfies Record<Day, string>;

export const DAY_LONG_NAMES = {
  M: "Monday",
  Tu: "Tuesday",
  W: "Wednesday",
  Th: "Thursday",
  F: "Friday",
  Sa: "Saturday",
  Su: "Sunday",
} as const satisfies Record<Day, string>;

/** Position in the week, Monday = 0. */
export function dayIndex(day: Day): number {
  return DAYS.indexOf(day);
}

export function compareDays(a: Day, b: Day): number {
  return dayIndex(a) - dayIndex(b);
}

/** Unique days in week order. */
export function sortDays(days: Iterable<Day>): Day[] {
  const set = new Set(days);
  return DAYS.filter((d) => set.has(d));
}

/** "18 min", "1 hr", "1 hr 5 min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/**
 * Reads "9:30am", "9:30 AM", "9am", "13:15" or "9" (hours only, 24-hour) into
 * minutes since midnight; null when it isn't a time.
 */
export function parseTime(text: string): Minutes | null {
  const match = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$/i.exec(
    text,
  );
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (m > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === "p" ? 12 : 0);
  } else if (h > 24 || (h === 24 && m > 0)) {
    return null;
  }
  return h * 60 + m;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Mar 22" */
export function formatShortDate(date: IsoDate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ""} ${d ?? ""}`;
}

/** "Mar 22–May 10" */
export function formatDateSpan(span: DateSpan): string {
  return `${formatShortDate(span.start)}–${formatShortDate(span.end)}`;
}
