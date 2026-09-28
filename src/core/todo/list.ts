import { seasonTermOf } from "../catalog/terms";
import {
  addDays,
  easternOffsetMinutes,
  formatIsoDate,
  weekdayOf,
} from "../ics/dates";
import type {
  CourseCode,
  Day,
  IsoDate,
  TermId,
  TodoFeedState,
  TodoItem,
} from "../schema";
import { formatShortDate, formatTime } from "../time";
import { relativeWords, spanWords } from "../words";
import { matchFeedCourse, pickFeedCourse } from "./feed";
import { DEFAULT_WEEK_START, type WeekStart, weekStartOf } from "./weeks";

// How Todo's list reads (docs/V3.md §3.9): items grouped by day or by course,
// done items folded away, and the header's words. Pure: "now" and "today"
// are arguments, and dates are America/New_York's, like the feed's.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * How far back the list reaches: open work that's past due, and the four
 * weeks the completion chart draws.
 */
export const TODO_LIST_PAST_DAYS = 28;
/** How far ahead it reaches; with the past days, inside `todo/list`'s 120. */
export const TODO_LIST_AHEAD_DAYS = 91;

/** The dates `todo/list` is asked for, from `today`. */
export function listRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return {
    from: addDays(today, -TODO_LIST_PAST_DAYS),
    to: addDays(today, TODO_LIST_AHEAD_DAYS),
  };
}

/** The New York wall clock at an instant: its date and minutes after midnight. */
export function newYorkClock(ms: number): { date: IsoDate; minutes: number } {
  for (const offset of [-300, -240]) {
    const local = ms + offset * MINUTE_MS;
    const date = formatIsoDate(local);
    const minutes = Math.floor(
      (((local % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS,
    );
    if (easternOffsetMinutes(date, minutes) === offset)
      return { date, minutes };
  }
  // The repeated hour after daylight time ends: read as standard time.
  const local = ms - 300 * MINUTE_MS;
  return {
    date: formatIsoDate(local),
    minutes: Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS),
  };
}

/** "11:59pm" in New York, or "All day" for an item with only a date. */
export function dueTimeLabel(item: Pick<TodoItem, "dueAt">): string {
  if (item.dueAt === null) return "All day";
  return formatTime(newYorkClock(Date.parse(item.dueAt)).minutes);
}

const WEEKDAY_NAMES: Record<Day, string> = {
  M: "Monday",
  Tu: "Tuesday",
  W: "Wednesday",
  Th: "Thursday",
  F: "Friday",
  Sa: "Saturday",
  Su: "Sunday",
};

/** "Today", "Tomorrow", "Yesterday", or "Wednesday, Sep 30". */
export function dayLabel(date: IsoDate, today: IsoDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${formatShortDate(date)}`;
}

/** Words for when an item's due, in a list that isn't by day: "Friday, Oct 2 · 1pm", or "No date". */
export function dueWords(
  item: Pick<TodoItem, "dueAt" | "dueDate">,
  today: IsoDate,
): string {
  if (item.dueDate === null) return NO_DATE;
  return `${dayLabel(item.dueDate, today)} · ${dueTimeLabel(item)}`;
}

/** Where own tasks without a date go, at the bottom of the list. */
export const NO_DATE = "No date";

/**
 * Soonest first: by date, then time (all-day items first), then title.
 * Items with no date (own tasks) go last.
 */
export function compareItems(a: TodoItem, b: TodoItem): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const at = a.dueAt === null ? "" : a.dueAt;
  const bt = b.dueAt === null ? "" : b.dueAt;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** One day in the list: its open items, and its done ones folded away. */
export interface TodoDay {
  /** Null for "No date": own tasks without one. */
  date: IsoDate | null;
  label: string;
  open: TodoItem[];
  done: TodoItem[];
}

export type TodoSectionId =
  | "earlier"
  | "today"
  | "tomorrow"
  | "this-week"
  | "next-week"
  | "later"
  | "no-date";

/** A run of days under one heading. */
export interface TodoSection {
  id: TodoSectionId;
  label: string;
  days: TodoDay[];
  /** What an empty section says; null when it isn't shown empty. */
  empty: string | null;
}

const SECTION_LABELS: Record<TodoSectionId, string> = {
  earlier: "Earlier",
  today: "Today",
  tomorrow: "Tomorrow",
  "this-week": "This week",
  "next-week": "Next week",
  later: "Later",
  "no-date": NO_DATE,
};

function sectionOf(
  date: IsoDate,
  today: IsoDate,
  nextWeek: IsoDate,
): TodoSectionId {
  if (date < today) return "earlier";
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date < nextWeek) return "this-week";
  if (date < addDays(nextWeek, 7)) return "next-week";
  return "later";
}

/**
 * The list by day (V3 §3.9): Today, Tomorrow, the rest of this week, next
 * week and later, each day with its open items and its done ones apart.
 * Today and Tomorrow always show, saying "Nothing due" when empty; so does
 * this week while it has days left, and next week. Earlier shows only open
 * work that's past due, with nothing folded: done past items are finished
 * business. Own tasks without a date go last, under "No date".
 */
export function groupByDay(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  today: IsoDate,
  start: WeekStart = DEFAULT_WEEK_START,
): TodoSection[] {
  const nextWeek = addDays(weekStartOf(today, start), 7);
  const days = new Map<IsoDate, TodoDay & { date: IsoDate }>();
  const dayOf = (date: IsoDate) => {
    let day = days.get(date);
    if (!day) {
      day = { date, label: dayLabel(date, today), open: [], done: [] };
      days.set(date, day);
    }
    return day;
  };
  const undated: TodoDay = { date: null, label: NO_DATE, open: [], done: [] };
  for (const item of [...items].sort(compareItems)) {
    const isDone = done.has(item.uid);
    const day = item.dueDate === null ? undated : dayOf(item.dueDate);
    if (day.date !== null && day.date < today && isDone) continue;
    (isDone ? day.done : day.open).push(item);
  }
  dayOf(today);
  dayOf(addDays(today, 1));

  const sections = new Map<TodoSectionId, TodoDay[]>();
  for (const day of [...days.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  )) {
    const id = sectionOf(day.date, today, nextWeek);
    sections.set(id, [...(sections.get(id) ?? []), day]);
  }

  const weekHasDaysLeft = addDays(today, 2) < nextWeek;
  const order: TodoSectionId[] = [
    "earlier",
    "today",
    "tomorrow",
    "this-week",
    "next-week",
    "later",
  ];
  const out: TodoSection[] = [];
  for (const id of order) {
    const sectionDays = sections.get(id) ?? [];
    const empty =
      id === "this-week" && weekHasDaysLeft
        ? "Nothing due this week."
        : id === "next-week"
          ? "Nothing due next week."
          : null;
    if (sectionDays.length === 0 && empty === null) continue;
    out.push({ id, label: SECTION_LABELS[id], days: sectionDays, empty });
  }
  if (undated.open.length > 0 || undated.done.length > 0)
    out.push({
      id: "no-date",
      label: SECTION_LABELS["no-date"],
      days: [undated],
      empty: null,
    });
  return out;
}

/** The course an item is filed and colored under, re-matched against the person's plans. */
export function itemCourse(
  item: Pick<TodoItem, "courseLabel" | "courseCode">,
  planCourses: ReadonlySet<CourseCode>,
): CourseCode | null {
  const codes = matchFeedCourse(item.courseLabel).map((c) => c.code);
  if (codes.length === 0) return item.courseCode;
  return pickFeedCourse(codes, planCourses);
}

/** Items with no course at all are grouped under this key. */
export const NO_COURSE_KEY = "Other";

/**
 * The course group an item is filed under: its code (re-matched against the
 * person's plans), else the ELMS course name, else "Other". Hiding a course
 * hides this key.
 */
export function courseKey(
  item: Pick<TodoItem, "courseLabel" | "courseCode">,
  planCourses: ReadonlySet<CourseCode>,
): string {
  return itemCourse(item, planCourses) ?? item.courseLabel ?? NO_COURSE_KEY;
}

/**
 * Whether an item is in a course the person hid: its group's key, or any
 * course code it carries (a cross-listed item goes with either code, as the
 * server's "Due tomorrow" reads it).
 */
export function isHiddenItem(
  item: Pick<TodoItem, "courseLabel" | "courseCode">,
  hidden: ReadonlySet<string>,
  planCourses: ReadonlySet<CourseCode>,
): boolean {
  if (hidden.size === 0) return false;
  if (hidden.has(courseKey(item, planCourses))) return true;
  if (item.courseCode !== null && hidden.has(item.courseCode)) return true;
  return matchFeedCourse(item.courseLabel).some((c) => hidden.has(c.code));
}

/**
 * How an item due today reads, from `nowMs`: "Due in 3 hours", "Due in 25
 * minutes", "Due now", or "Due 2 hours ago". Null for anything not due
 * today at a time (tomorrow, all day, no date), which keeps its clock time.
 * Both are counted down, never up, so it never says there's more time left
 * than there is.
 */
export function relativeDue(
  item: Pick<TodoItem, "dueAt" | "dueDate">,
  nowMs: number,
  today: IsoDate,
): string | null {
  if (item.dueAt === null || item.dueDate !== today) return null;
  const diff = Date.parse(item.dueAt) - nowMs;
  if (Math.abs(diff) < MINUTE_MS) return "Due now";
  const words = spanWords(Math.abs(diff));
  return diff > 0 ? `Due in ${words}` : `Due ${words} ago`;
}

/**
 * The term a course's chat room is for: the one its next item is due in
 * (from today on, else the latest), by season, since Todo has no academic
 * calendars. Winter's few weeks count as the spring they lead into: an
 * ELMS course posting work in January is a spring course. A course of own
 * tasks with no dates is in today's term.
 */
export function courseChatTerm(
  items: readonly Pick<TodoItem, "dueDate">[],
  today: IsoDate,
): TermId | null {
  const dates = items
    .flatMap((i) => (i.dueDate === null ? [] : [i.dueDate]))
    .sort();
  const next =
    dates.find((date) => date >= today) ??
    dates.at(-1) ??
    (items.length > 0 ? today : null);
  if (next === null) return null;
  const term = seasonTermOf(next);
  return term.endsWith("12") ? `${Number(term.slice(0, 4)) + 1}01` : term;
}

/** Open items the list shows: past-due ones and everything from today on. */
export function openCount(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
): number {
  return items.filter((item) => !done.has(item.uid)).length;
}

/** The header's second half: when ELMS was last read, and how that went. */
export function feedWords(
  feed: TodoFeedState | null,
  now: number,
): { checked: string | null; problem: string | null } {
  if (!feed) return { checked: null, problem: null };
  if (feed.status === "broken")
    return {
      checked: null,
      problem: "ELMS stopped sharing your calendar. Paste a new link.",
    };
  const checked =
    feed.lastSuccessAt === null
      ? null
      : `ELMS feed checked ${relativeWords(feed.lastSuccessAt, now)}`;
  // The last try failed after the last success: the list may be stale.
  const failedLast =
    feed.lastError !== null &&
    feed.lastFetchAt !== null &&
    (feed.lastSuccessAt === null || feed.lastFetchAt > feed.lastSuccessAt);
  return {
    checked,
    problem: failedLast
      ? "ELMS didn't answer. We'll try again in 20 minutes."
      : null,
  };
}

/** "8 open". */
export function openWords(count: number): string {
  return `${count} open`;
}

/** "3 done". */
export function doneWords(count: number): string {
  return `${count} done`;
}

/** Opening `/todo` asks ELMS again when the last read is older than this (V3 §3.5). */
export const TODO_OPEN_REFRESH_MS = 10 * MINUTE_MS;

/** Whether opening the list should ask ELMS again. */
export function isStale(
  feed: TodoFeedState | null,
  now: number,
  ms = TODO_OPEN_REFRESH_MS,
): boolean {
  if (!feed || feed.status === "broken") return false;
  if (feed.lastSuccessAt === null) return true;
  return now - Date.parse(feed.lastSuccessAt) > ms;
}
