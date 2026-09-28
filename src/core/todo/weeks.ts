import { addDays, weekdayOf } from "../ics/dates";
import type { CourseCode, Day, IsoDate, TodoItem } from "../schema";
import { formatShortDate } from "../time";

// Todo's calendar (docs/V3.md §3.9): weeks, months and the span each view
// shows, with the week starting Monday (so a Sunday-night deadline ends its
// week) or Sunday, as the person sets it. Pure: dates are New York's.

/** The day weeks start on: Monday by default, Sunday by the setting. */
export type WeekStart = "monday" | "sunday";

export const DEFAULT_WEEK_START: WeekStart = "monday";

/** Todo's views: the week (the default), the month, and the list by day. */
export type CalendarView = "week" | "month" | "list";

const ORDER: Record<WeekStart, readonly Day[]> = {
  monday: ["M", "Tu", "W", "Th", "F", "Sa", "Su"],
  sunday: ["Su", "M", "Tu", "W", "Th", "F", "Sa"],
};

const SHORT: Record<Day, string> = {
  M: "Mon",
  Tu: "Tue",
  W: "Wed",
  Th: "Thu",
  F: "Fri",
  Sa: "Sat",
  Su: "Sun",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The seven weekday names in the order the calendar shows them. */
export function weekdayNames(start: WeekStart): string[] {
  return ORDER[start].map((d) => SHORT[d]);
}

/** The first day of the week `date` is in. */
export function weekStartOf(date: IsoDate, start: WeekStart): IsoDate {
  return addDays(date, -ORDER[start].indexOf(weekdayOf(date)));
}

/** Seven dates from a week's first day. */
export function weekDates(first: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The first of `date`'s month. */
export function monthOf(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

/** The first of the month `by` months from `date`'s. */
export function addMonths(date: IsoDate, by: number): IsoDate {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + by;
  const year = y + Math.floor(m / 12);
  const month = (((m % 12) + 12) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * The month as weeks: whole weeks from the one the 1st is in to the one
 * the last day is in (four to six rows).
 */
export function monthWeeks(date: IsoDate, start: WeekStart): IsoDate[][] {
  const first = monthOf(date);
  const last = addDays(addMonths(first, 1), -1);
  const weeks: IsoDate[][] = [];
  for (
    let week = weekStartOf(first, start);
    week <= last;
    week = addDays(week, 7)
  )
    weeks.push(weekDates(week));
  return weeks;
}

/** The dates a view shows around `anchor`; the list shows what's loaded. */
export function viewSpan(
  view: Exclude<CalendarView, "list">,
  anchor: IsoDate,
  start: WeekStart,
): { from: IsoDate; to: IsoDate } {
  if (view === "week") {
    const from = weekStartOf(anchor, start);
    return { from, to: addDays(from, 6) };
  }
  const weeks = monthWeeks(anchor, start);
  const first = weeks[0]?.[0] ?? anchor;
  const last = weeks.at(-1)?.[6] ?? anchor;
  return { from: first, to: last };
}

/** Where Back and Ahead go: a week, or a month (its 1st). */
export function shiftAnchor(
  view: CalendarView,
  anchor: IsoDate,
  by: -1 | 1,
  start: WeekStart,
): IsoDate {
  if (view === "month") return addMonths(anchor, by);
  return addDays(weekStartOf(anchor, start), by * 7);
}

/** Whether `anchor` is in the same period as today: Today has nothing to do. */
export function isCurrentPeriod(
  view: CalendarView,
  anchor: IsoDate,
  today: IsoDate,
  start: WeekStart,
): boolean {
  if (view === "list") return true;
  if (view === "month") return monthOf(anchor) === monthOf(today);
  return weekStartOf(anchor, start) === weekStartOf(today, start);
}

/** "October 2026". */
export function monthTitle(date: IsoDate): string {
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1] ?? ""} ${date.slice(0, 4)}`;
}

/** "Sep 28 – Oct 4", with the year when it isn't this one's. */
export function weekTitle(first: IsoDate, today: IsoDate): string {
  const last = addDays(first, 6);
  const span = `${formatShortDate(first)} – ${formatShortDate(last)}`;
  return last.slice(0, 4) === today.slice(0, 4)
    ? span
    : `${span}, ${last.slice(0, 4)}`;
}

/** "Mon, Sep 28". */
export function shortDayLabel(date: IsoDate): string {
  return `${SHORT[weekdayOf(date)]}, ${formatShortDate(date)}`;
}

/** Done and all, of what's due in a run of days. */
export interface Progress {
  done: number;
  total: number;
}

/** One week of one course: when it starts, and what's done of what's due. */
export interface WeekTally extends Progress {
  week: IsoDate;
}

/** A course's weeks, oldest first, ending with the week shown. */
export interface CourseWeeks {
  /** The course code, the ELMS course name, or "Other". */
  key: string;
  code: CourseCode | null;
  /** The ELMS course name, when the feed gave one. */
  label: string | null;
  weeks: WeekTally[];
}

/**
 * Each course's completion, week by week: `count` weeks ending with the one
 * starting `lastWeek`, what's due in each and how much of it is done.
 * Courses with anything due in those weeks, by code; items with no course
 * last. The chart in Todo's side panel draws it.
 */
export function courseWeeks(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  lastWeek: IsoDate,
  count: number,
  course: (item: TodoItem) => {
    key: string;
    code: CourseCode | null;
    label: string | null;
  },
): CourseWeeks[] {
  const firstWeek = addDays(lastWeek, -7 * (count - 1));
  const end = addDays(lastWeek, 6);
  const out = new Map<string, CourseWeeks>();
  for (const item of items) {
    if (item.dueDate === null) continue;
    if (item.dueDate < firstWeek || item.dueDate > end) continue;
    const { key, code, label } = course(item);
    let row = out.get(key);
    if (!row) {
      row = {
        key,
        code,
        label,
        weeks: Array.from({ length: count }, (_, i) => ({
          week: addDays(firstWeek, 7 * i),
          done: 0,
          total: 0,
        })),
      };
      out.set(key, row);
    }
    const index = Math.floor(
      (Date.parse(item.dueDate) - Date.parse(firstWeek)) / (7 * 86_400_000),
    );
    const tally = row.weeks[index];
    if (!tally) continue;
    tally.total += 1;
    if (done.has(item.uid)) tally.done += 1;
  }
  const rank = (r: CourseWeeks) => (r.code !== null ? 0 : r.label ? 1 : 2);
  return [...out.values()].sort(
    (a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key),
  );
}

/** A week's done and due across every course. */
export function totalOf(rows: readonly CourseWeeks[], index: number): Progress {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    const week = row.weeks[index];
    if (!week) continue;
    done += week.done;
    total += week.total;
  }
  return { done, total };
}

/** A run of dates `todo/list` was asked for. */
export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

/** Whether `want` is inside one of the ranges already loaded. */
export function rangeLoaded(
  loaded: readonly DateRange[],
  want: DateRange,
): boolean {
  return loaded.some((r) => r.from <= want.from && r.to >= want.to);
}

/**
 * What to ask `todo/list` for to show `want`: from four weeks before it (the
 * chart's past weeks) as far ahead as one call goes (`days`, inside
 * `TODO_LIST_MAX_DAYS`), so moving on a week or a month rarely asks again.
 */
export function rangeToLoad(want: DateRange, days: number): DateRange {
  const from = addDays(want.from, -28);
  const to = addDays(from, days);
  return { from, to: to < want.to ? want.to : to };
}

/**
 * A list after loading `range`: what it had outside the range, and the
 * answer for inside it (undated tasks come with every answer). Done marks
 * the same way.
 */
export function mergeRange(
  have: { items: readonly TodoItem[]; done: ReadonlySet<string> },
  range: DateRange,
  got: { items: readonly TodoItem[]; done: readonly string[] },
): { items: TodoItem[]; done: Set<string> } {
  const inside = (item: TodoItem) =>
    item.dueDate === null ||
    (item.dueDate >= range.from && item.dueDate <= range.to);
  const kept = have.items.filter((item) => !inside(item));
  const keptUids = new Set(kept.map((i) => i.uid));
  const done = new Set([...have.done].filter((uid) => keptUids.has(uid)));
  for (const uid of got.done) done.add(uid);
  const items = [...kept, ...got.items.filter((i) => !keptUids.has(i.uid))];
  return { items, done };
}
