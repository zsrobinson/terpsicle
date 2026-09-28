import { addDays, weekdayOf } from "../ics/dates";
import type {
  AcademicCalendar,
  CourseCode,
  IsoDate,
  Minutes,
  TermId,
  TodoItem,
} from "../schema";
import { compareItems } from "../todo/list";
import { type WeekStart, weekStartOf } from "../todo/weeks";

// Home's "This week" and "Coming up" (docs/V3.md §1.5): Todo's items,
// a class at a time for the week you're in, and the few after it. The week
// is Todo's: Monday to Sunday, or from Sunday when you set it so. Pure: the
// page passes the date, the list and how items file under courses.

/** The dates Todo's week view opens on for `today`. */
export function weekOf(
  today: IsoDate,
  start: WeekStart,
): { from: IsoDate; to: IsoDate } {
  const from = weekStartOf(today, start);
  return { from, to: addDays(from, 6) };
}

/** How an item files under a course, as Todo files it. */
export type ItemCourse = (item: TodoItem) => {
  key: string;
  code: CourseCode | null;
  label: string | null;
};

/** One class's week: what's due, what's done, and what's still open. */
export type ClassWeek = {
  /** The course code, the ELMS course name, or "Other" (Todo's `courseKey`). */
  readonly key: string;
  readonly code: CourseCode | null;
  readonly label: string | null;
  readonly done: number;
  readonly total: number;
  /** Open items due this week, soonest first; the first is the one to do next. */
  readonly open: readonly TodoItem[];
};

/**
 * The week's items by class, done and left: "todo status across classes
 * for the week". Classes with something still open come first, the one
 * whose next item is due soonest at the top; classes that are all done go
 * last, by name. Items with no date aren't in any week.
 */
export function weekByClass(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  week: { from: IsoDate; to: IsoDate },
  course: ItemCourse,
): ClassWeek[] {
  const rows = new Map<
    string,
    {
      key: string;
      code: CourseCode | null;
      label: string | null;
      done: number;
      total: number;
      open: TodoItem[];
    }
  >();
  for (const item of items) {
    if (item.dueDate === null) continue;
    if (item.dueDate < week.from || item.dueDate > week.to) continue;
    const { key, code, label } = course(item);
    let row = rows.get(key);
    if (!row) {
      row = { key, code, label, done: 0, total: 0, open: [] };
      rows.set(key, row);
    }
    row.total += 1;
    if (done.has(item.uid)) row.done += 1;
    else row.open.push(item);
  }
  for (const row of rows.values()) row.open.sort(compareItems);
  return [...rows.values()].sort((a, b) => {
    const an = a.open[0];
    const bn = b.open[0];
    if (an && bn) return compareItems(an, bn) || a.key.localeCompare(b.key);
    if (an) return -1;
    if (bn) return 1;
    return a.key.localeCompare(b.key);
  });
}

/** The week's done and due across every class: "7 of 12 done". */
export function weekTotals(rows: readonly ClassWeek[]): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    done += row.done;
    total += row.total;
  }
  return { done, total };
}

/** How far "Coming up" looks past the week: three weeks, where exams sit. */
export const COMING_UP_DAYS = 21;

/** At most this many items in "Coming up". */
export const COMING_UP_MAX = 4;

/**
 * "Coming up": open items due after the week (`after`, its last day), within
 * the next COMING_UP_DAYS days, soonest first. What to start on early.
 */
export function comingUp(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  after: IsoDate,
  max: number = COMING_UP_MAX,
): TodoItem[] {
  const last = addDays(after, COMING_UP_DAYS);
  return items
    .filter(
      (i) =>
        i.dueDate !== null &&
        i.dueDate > after &&
        i.dueDate <= last &&
        !done.has(i.uid),
    )
    .sort(compareItems)
    .slice(0, max);
}

/**
 * Which week of classes `today` is in, counting the week classes start in
 * as week 1 (weeks from Monday), or null outside the term's classes. Only
 * from a published calendar: the season's usual dates would guess wrong.
 */
export function termWeek(
  today: IsoDate,
  termId: TermId,
  calendars: readonly AcademicCalendar[],
): number | null {
  const calendar = calendars.find((c) => c.termId === termId);
  if (calendar?.status !== "published") return null;
  if (today < calendar.classesStart || today > calendar.classesEnd) return null;
  const first = weekStartOf(calendar.classesStart, "monday");
  const days = Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000);
  return Math.floor(days / 7) + 1;
}

/**
 * How long until a class starts, for its "Next" tag: "in 5 min", "in 40
 * min", "in 1 hr 20 min", "in 2 hr". Null past three hours, where the
 * clock time already says it.
 */
export function startsInWords(start: Minutes, now: Minutes): string | null {
  const left = start - now;
  if (left <= 0 || left > 180) return null;
  if (left < 60) return `in ${left} min`;
  const hours = Math.floor(left / 60);
  const minutes = left % 60;
  return minutes === 0 ? `in ${hours} hr` : `in ${hours} hr ${minutes} min`;
}

/** "Monday", "Tomorrow": the day a later list is for. */
export function laterDayWords(date: IsoDate, today: IsoDate): string {
  if (date === addDays(today, 1)) return "Tomorrow";
  return DAY_NAMES[weekdayOf(date)];
}

const DAY_NAMES = {
  M: "Monday",
  Tu: "Tuesday",
  W: "Wednesday",
  Th: "Thursday",
  F: "Friday",
  Sa: "Saturday",
  Su: "Sunday",
} as const;
