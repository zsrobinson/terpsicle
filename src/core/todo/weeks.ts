import { addDays, weekdayOf } from "../ics/dates";
import type { CourseCode, Day, IsoDate, TodoItem } from "../schema";
import { formatShortDate } from "../time";

// Todo's week (docs/V3.md §3.9): its dates, and the weeks before and after,
// starting Monday, so a Sunday-night deadline ends its week (the owner,
// 2026-09-29: "starting things on monday makes too much sense to have a
// toggle for it"). Home's week takes the start as an argument. Pure: dates
// are New York's.

/** The day a week starts on. Todo's weeks start on Monday. */
export type WeekStart = "monday" | "sunday";

export const DEFAULT_WEEK_START: WeekStart = "monday";

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

/** The first day of the week `date` is in: its Monday, unless asked. */
export function weekStartOf(
  date: IsoDate,
  start: WeekStart = DEFAULT_WEEK_START,
): IsoDate {
  return addDays(date, -ORDER[start].indexOf(weekdayOf(date)));
}

/** Seven dates from a week's first day. */
export function weekDates(first: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** Saturday and Sunday, which the week shades. */
export function isWeekend(date: IsoDate): boolean {
  const day = weekdayOf(date);
  return day === "Sa" || day === "Su";
}

/** "Mon". */
export function weekdayShort(date: IsoDate): string {
  return SHORT[weekdayOf(date)];
}

/** The Monday to Sunday that `anchor` is in. */
export function weekSpan(anchor: IsoDate): { from: IsoDate; to: IsoDate } {
  const from = weekStartOf(anchor);
  return { from, to: addDays(from, 6) };
}

/** Where Back and Ahead go: the Monday a week before or after. */
export function shiftWeek(anchor: IsoDate, by: -1 | 1): IsoDate {
  return addDays(weekStartOf(anchor), by * 7);
}

/** Whether `anchor` is in today's week, where Today has nothing to do. */
export function isThisWeek(anchor: IsoDate, today: IsoDate): boolean {
  return weekStartOf(anchor) === weekStartOf(today);
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

/** One course's week: what's due in it, and how much of that is done. */
export interface CourseWeek extends Progress {
  /** The course code, the ELMS course name, or "Other". */
  key: string;
  code: CourseCode | null;
  /** The ELMS course name, when the feed gave one. */
  label: string | null;
}

/**
 * Each course's week from `first` (a Monday) to the Sunday after: what's
 * due and how much of it is done. Courses with anything due that week, by
 * code; items with no course last. Todo's sidebar draws a bar for each.
 */
export function courseWeek(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  first: IsoDate,
  course: (item: TodoItem) => {
    key: string;
    code: CourseCode | null;
    label: string | null;
  },
): CourseWeek[] {
  const last = addDays(first, 6);
  const out = new Map<string, CourseWeek>();
  for (const item of items) {
    if (item.dueDate === null) continue;
    if (item.dueDate < first || item.dueDate > last) continue;
    const { key, code, label } = course(item);
    let row = out.get(key);
    if (!row) {
      row = { key, code, label, done: 0, total: 0 };
      out.set(key, row);
    }
    row.total += 1;
    if (done.has(item.uid)) row.done += 1;
  }
  const rank = (r: CourseWeek) => (r.code !== null ? 0 : r.label ? 1 : 2);
  return [...out.values()].sort(
    (a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key),
  );
}

/** The week's done and due across the courses given. */
export function totalOf(rows: readonly Progress[]): Progress {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    done += row.done;
    total += row.total;
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
 * What to ask `todo/list` for to show `want`: from four weeks before it as
 * far ahead as one call goes (`days`, inside
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
