import { addDays } from "../ics/dates";
import {
  type FeedItem,
  type IsoDate,
  TODO_WINDOW_AHEAD_DAYS,
  TODO_WINDOW_PAST_DAYS,
  type TodoFileItem,
  type TodoItem,
} from "../schema";
import { looksLikeExam, matchFeedCourse } from "./feed";
import { isElmsUrl } from "./link";

// Which parsed items the server keeps, and how they look to the app
// (docs/V3.md §3.4, §3.7).

/** The dates kept: 30 days back through a year ahead of `today`. */
export function todoWindow(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return {
    from: addDays(today, -TODO_WINDOW_PAST_DAYS),
    to: addDays(today, TODO_WINDOW_AHEAD_DAYS),
  };
}

/**
 * The items inside the window, soonest first, at most `cap` of them (the
 * earliest win: a year out can wait for a later fetch). `skipped` counts the
 * rest.
 */
export function keepInWindow<T extends { dueDate: IsoDate }>(
  items: readonly T[],
  today: IsoDate,
  cap: number,
): { kept: T[]; skipped: number } {
  const { from, to } = todoWindow(today);
  const inside = items
    .filter((item) => item.dueDate >= from && item.dueDate <= to)
    .sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
    )
    .slice(0, cap);
  return { kept: inside, skipped: items.length - inside.length };
}

/** A parsed item as the app gets it: the first course code only. */
export function toTodoItem(item: FeedItem): TodoItem {
  return {
    uid: item.uid,
    source: item.source,
    title: item.title,
    courseLabel: item.courseLabel,
    courseCode: item.courseCodes[0] ?? null,
    sectionCode: item.sectionCode,
    kind: item.kind,
    exam: item.looksLikeExam,
    gradescope: item.gradescope,
    dueAt: item.dueAt,
    dueDate: item.dueDate,
    link: item.link,
  };
}

/**
 * A dropped file's item, from what the browser sent. The course codes and
 * the exam guess are read again from the words rather than trusted, and a
 * link off the ELMS hosts is dropped.
 */
export function fromFileItem(item: TodoFileItem): FeedItem {
  const courses = matchFeedCourse(item.courseLabel);
  return {
    uid: item.uid,
    source: "file",
    title: item.title,
    courseLabel: item.courseLabel,
    courseCodes: courses.map((c) => c.code),
    sectionCode: courses[0]?.sectionCode ?? null,
    kind: item.kind,
    kindFrom: "title",
    looksLikeExam: looksLikeExam(item.title),
    gradescope: item.gradescope,
    dueAt: item.dueAt,
    dueDate: item.dueDate,
    endAt: null,
    link: item.link !== null && isElmsUrl(item.link) ? item.link : null,
  };
}
