import { addDays } from "../ics/dates";
import type { IsoDate, TodoItem } from "../schema";
import { compareItems, dueTimeLabel, newYorkClock } from "./list";

// "Due tomorrow" (docs/V3.md §4): at 6pm in New York, one push to each
// person with something not done that's due the next day. Pure: the Todo
// cron passes its run's time, and daylight saving needs no second cron
// because the time is read on New York's clock.

/** When the reminder goes: 18:00 New York time, in minutes after midnight. */
export const TODO_DUE_SEND_MINUTES = 18 * 60;

/** A feed that hasn't fetched in this long doesn't remind: stale data mustn't. */
export const TODO_DUE_FRESH_MS = 26 * 3_600_000;

/** Longest item title a push shows. */
const TITLE_CHARS = 60;

/**
 * The New York dates a Todo cron run at `nowMs` sends for: `today` (the
 * reminder's day, in its dedupe key) and `tomorrow` (the due date it's
 * about). Null before 6pm. Every run from 6pm to midnight answers, so a
 * failed run is caught up by the next; the dedupe key keeps it to one a day.
 */
export function dueTomorrowRun(
  nowMs: number,
): { today: IsoDate; tomorrow: IsoDate } | null {
  const { date, minutes } = newYorkClock(nowMs);
  if (minutes < TODO_DUE_SEND_MINUTES) return null;
  return { today: date, tomorrow: addDays(date, 1) };
}

/** One a day per person: `todo-due:<userId>:<New York date>`. */
export function dueTomorrowKey(userId: string, today: IsoDate): string {
  return `todo-due:${userId}:${today}`;
}

function cut(text: string, max = TITLE_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** "Project 2 (CMSC216) 11:59pm", or without the parts it doesn't have. */
function itemWords(item: TodoItem): string {
  const course = item.courseCode ? ` (${item.courseCode})` : "";
  const time = item.dueAt === null ? "" : ` ${dueTimeLabel(item)}`;
  return `${cut(item.title)}${course}${time}`;
}

/**
 * The push (V3.md §4): "3 things due tomorrow" with the first two and how
 * many more, or for one item "Project 2 is due tomorrow" with its course
 * and time. Opens the list at tomorrow. `items` are the ones not done.
 */
export function dueTomorrowPush(
  items: readonly TodoItem[],
  tomorrow: IsoDate,
): { title: string; body: string; url: string; tag: string } {
  const sorted = [...items].sort(compareItems);
  const url = `/todo?day=${tomorrow}`;
  const tag = "todo-due";
  const [first] = sorted;
  if (sorted.length === 1 && first) {
    const parts = [first.courseCode, first.dueAt ? dueTimeLabel(first) : null];
    return {
      title: `${cut(first.title)} is due tomorrow`,
      body: parts.filter((p) => p !== null).join(" · ") || "Due tomorrow",
      url,
      tag,
    };
  }
  const shown = sorted.slice(0, 2).map(itemWords);
  const more = sorted.length - shown.length;
  return {
    title: `${sorted.length} things due tomorrow`,
    body:
      more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(" and "),
    url,
    tag,
  };
}
