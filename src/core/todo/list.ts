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
import { matchFeedCourse, pickFeedCourse } from "./feed";

// How Todo's list reads (docs/V3.md §3.9): items grouped by day or by course,
// done items folded away, and the header's words. Pure: "now" and "today"
// are arguments, and dates are America/New_York's, like the feed's.

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** How far back the list reaches for open work that's past due. */
export const TODO_LIST_PAST_DAYS = 14;
/** How far ahead it reaches; with the past days, inside `todo/list`'s 120. */
export const TODO_LIST_AHEAD_DAYS = 105;

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

/** The Monday on or before a date: weeks run Monday to Sunday, like classes. */
export function weekStart(date: IsoDate): IsoDate {
  const back = { M: 0, Tu: 1, W: 2, Th: 3, F: 4, Sa: 5, Su: 6 }[
    weekdayOf(date)
  ];
  return addDays(date, -back);
}

/**
 * The Monday of the week the Week view opens on: this one on a weekday,
 * the coming one on a Saturday or Sunday, when what's left of this week is
 * the weekend and what's due next is what a student is planning for.
 */
export function openingWeek(today: IsoDate): IsoDate {
  const day = weekdayOf(today);
  const monday = weekStart(today);
  return day === "Sa" || day === "Su" ? addDays(monday, 7) : monday;
}

/** Seven dates from a week's Monday. */
export function weekDates(monday: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Soonest first: by date, then time (all-day items first), then title. */
export function compareItems(a: TodoItem, b: TodoItem): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  const at = a.dueAt === null ? "" : a.dueAt;
  const bt = b.dueAt === null ? "" : b.dueAt;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** One day in the list: its open items, and its done ones folded away. */
export interface TodoDay {
  date: IsoDate;
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
  | "later";

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
};

function sectionOf(date: IsoDate, today: IsoDate): TodoSectionId {
  if (date < today) return "earlier";
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  const nextMonday = addDays(weekStart(today), 7);
  if (date < nextMonday) return "this-week";
  if (date < addDays(nextMonday, 7)) return "next-week";
  return "later";
}

/**
 * The list by day (V3 §3.9): Today, Tomorrow, the rest of this week, next
 * week and later, each day with its open items and its done ones apart.
 * Today and Tomorrow always show, saying "Nothing due" when empty; so does
 * this week while it has days left, and next week. Earlier shows only open
 * work that's past due, with nothing folded: done past items are finished
 * business.
 */
export function groupByDay(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  today: IsoDate,
): TodoSection[] {
  const days = new Map<IsoDate, TodoDay>();
  const dayOf = (date: IsoDate) => {
    let day = days.get(date);
    if (!day) {
      day = { date, label: dayLabel(date, today), open: [], done: [] };
      days.set(date, day);
    }
    return day;
  };
  for (const item of [...items].sort(compareItems)) {
    const isDone = done.has(item.uid);
    if (item.dueDate < today && isDone) continue;
    (isDone ? dayOf(item.dueDate).done : dayOf(item.dueDate).open).push(item);
  }
  dayOf(today);
  dayOf(addDays(today, 1));

  const sections = new Map<TodoSectionId, TodoDay[]>();
  for (const day of [...days.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  )) {
    const id = sectionOf(day.date, today);
    sections.set(id, [...(sections.get(id) ?? []), day]);
  }

  const nextMonday = addDays(weekStart(today), 7);
  const weekHasDaysLeft = addDays(today, 2) < nextMonday;
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

/** Done and all, of what's due in a run of days. */
export interface Progress {
  done: number;
  total: number;
}

/**
 * The span progress counts: the week the Week view calls "This week"
 * (`openingWeek`), so on a weekend it's the coming one, as there.
 */
function inThisWeek(date: IsoDate | null, today: IsoDate): boolean {
  if (date === null) return false;
  const monday = openingWeek(today);
  return date >= monday && date <= addDays(monday, 6);
}

/**
 * This week's progress: the items due Monday through Sunday of the week
 * the Week view opens on, done or not, and how many of them are done.
 */
export function weekProgress(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  today: IsoDate,
): Progress {
  const week = items.filter((i) => inThisWeek(i.dueDate, today));
  return {
    done: week.filter((i) => done.has(i.uid)).length,
    total: week.length,
  };
}

/** "3 of 5 done". */
export function progressWords({ done, total }: Progress): string {
  return `${done} of ${total} done`;
}

/** The header's line: "This week: 7 of 12 done", or null with nothing due. */
export function weekProgressWords(progress: Progress): string | null {
  return progress.total === 0 ? null : `This week: ${progressWords(progress)}`;
}

/** "Hidden: 2 courses". */
export function hiddenWords(count: number): string {
  return `Hidden: ${count} ${count === 1 ? "course" : "courses"}`;
}

const MINUTE_WORDS = (n: number) => (n === 1 ? "1 minute" : `${n} minutes`);
const HOUR_WORDS = (n: number) => (n === 1 ? "1 hour" : `${n} hours`);

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
  const away = Math.floor(Math.abs(diff) / MINUTE_MS);
  if (away < 1) return "Due now";
  const words =
    away < 60 ? MINUTE_WORDS(away) : HOUR_WORDS(Math.floor(away / 60));
  return diff > 0 ? `Due in ${words}` : `Due ${words} ago`;
}

/** One course in the by-course view. */
export interface TodoCourseGroup {
  /** The course code, the ELMS course name when there's no code, or "Other". */
  key: string;
  code: CourseCode | null;
  /** The ELMS course name, when the feed gave one. */
  label: string | null;
  open: TodoItem[];
  done: TodoItem[];
  /** Its items due this week (Monday to Sunday), done or not. */
  week: Progress;
}

/**
 * The list by course: each course's open items from today on, soonest first,
 * with its done ones folded. Courses with open work come first, by code;
 * items with no course at all go last, under "Other".
 */
export function groupByCourse(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  today: IsoDate,
  planCourses: ReadonlySet<CourseCode> = new Set(),
): TodoCourseGroup[] {
  const groups = new Map<string, TodoCourseGroup>();
  // This week counts what's done earlier in it too, which the list leaves out.
  const weeks = new Map<string, Progress>();
  for (const item of items) {
    if (!inThisWeek(item.dueDate, today)) continue;
    const key = courseKey(item, planCourses);
    const week = weeks.get(key) ?? { done: 0, total: 0 };
    weeks.set(key, {
      done: week.done + (done.has(item.uid) ? 1 : 0),
      total: week.total + 1,
    });
  }
  for (const item of [...items].sort(compareItems)) {
    const isDone = done.has(item.uid);
    if (item.dueDate !== null && item.dueDate < today && isDone) continue;
    const code = itemCourse(item, planCourses);
    const key = courseKey(item, planCourses);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        code,
        label: item.courseLabel,
        open: [],
        done: [],
        week: weeks.get(key) ?? { done: 0, total: 0 },
      };
      groups.set(key, group);
    }
    (isDone ? group.done : group.open).push(item);
  }
  const rank = (g: TodoCourseGroup) =>
    g.code !== null ? 0 : g.key !== NO_COURSE_KEY ? 1 : 2;
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.open.length === 0) - Number(b.open.length === 0) ||
      rank(a) - rank(b) ||
      a.key.localeCompare(b.key),
  );
}

/**
 * The term a course group's chat room is for: the one its next item is due
 * in (from today on, else the latest), by season, since Todo has no
 * academic calendars. Winter's few weeks count as the spring they lead into:
 * an ELMS course posting work in January is a spring course.
 */
export function courseChatTerm(
  group: Pick<TodoCourseGroup, "open" | "done">,
  today: IsoDate,
): TermId | null {
  const next =
    group.open.find((i) => i.dueDate >= today) ??
    group.done[0] ??
    group.open.at(-1);
  if (!next) return null;
  const term = seasonTermOf(next.dueDate);
  return term.endsWith("12") ? `${Number(term.slice(0, 4)) + 1}01` : term;
}

/** Open items the list shows: past-due ones and everything from today on. */
export function openCount(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
): number {
  return items.filter((item) => !done.has(item.uid)).length;
}

/** "just now", "14 min ago", "3 hours ago", "2 days ago". */
export function agoWords(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / MINUTE_MS));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
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
      : `ELMS feed checked ${agoWords(feed.lastSuccessAt, now)}`;
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
