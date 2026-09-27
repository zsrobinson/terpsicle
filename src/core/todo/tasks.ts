import { easternToUtc } from "../ics/dates";
import type { CourseCode, IsoDate, TodoItem } from "../schema";
import { todoWindow } from "./items";
import { newYorkClock } from "./list";

// Your own tasks (docs/V3.md §3.10): typed in Terpsicle, shown beside the
// feed's items as "Yours", never sent to ELMS. Pure: the date and time are
// New York's, like the feed's.

/** What a person types for a task, before it's saved. */
export interface TaskFields {
  title: string;
  courseCode: CourseCode | null;
  /** Null: "No date". */
  dueDate: IsoDate | null;
  /** Minutes after midnight in New York; null is all day (or no date). */
  dueTime: number | null;
}

/** The instant and date a task is due, from its New York date and time. */
export function ownTaskDue(
  dueDate: IsoDate | null,
  dueTime: number | null,
): { dueAt: string | null; dueDate: IsoDate | null } {
  if (dueDate === null) return { dueAt: null, dueDate: null };
  return {
    dueAt:
      dueTime === null
        ? null
        : new Date(easternToUtc(dueDate, dueTime)).toISOString(),
    dueDate,
  };
}

/** An own task as the list shows it, beside the feed's items. */
export function ownTaskItem(task: {
  uid: string;
  title: string;
  courseCode: CourseCode | null;
  dueAt: string | null;
  dueDate: IsoDate | null;
}): TodoItem {
  return {
    uid: task.uid,
    source: "own",
    title: task.title,
    courseLabel: null,
    courseCode: task.courseCode,
    sectionCode: null,
    kind: "assignment",
    exam: false,
    gradescope: false,
    dueAt: task.dueAt,
    dueDate: task.dueDate,
    link: null,
  };
}

/** A task's fields, from the item, for editing it. */
export function taskFieldsOf(item: TodoItem): TaskFields {
  return {
    title: item.title,
    courseCode: item.courseCode,
    dueDate: item.dueDate,
    dueTime:
      item.dueAt === null ? null : newYorkClock(Date.parse(item.dueAt)).minutes,
  };
}

/** Whether a task's date is one Todo keeps (30 days back to a year ahead); no date always is. */
export function taskDateInWindow(
  dueDate: IsoDate | null,
  today: IsoDate,
): boolean {
  if (dueDate === null) return true;
  const { from, to } = todoWindow(today);
  return dueDate >= from && dueDate <= to;
}

/** A time field's value ("13:05") as minutes after midnight, or null. */
export function minutesFromTimeField(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes after midnight as a time field's value ("13:05"). */
export function timeFieldFromMinutes(minutes: number | null): string {
  if (minutes === null) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
