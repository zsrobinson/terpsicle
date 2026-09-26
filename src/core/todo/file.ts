import {
  TODO_IMPORT_MAX_BYTES,
  TODO_MAX_FILE_ITEMS,
  type TodoFileItem,
} from "../schema";
import { parseIcs } from "./ics";

// "Add a calendar file" (docs/V3.md §3.7): a .ics the student exported
// themselves, read in the browser. Only the structured items go to
// `todo/import-file`; the file's text never leaves the browser.

/** The largest file we'll read (V3 §3.7). */
export const TODO_FILE_MAX_BYTES = 2 * 1024 * 1024;

export type TodoFileRead =
  | { status: "ok"; items: TodoFileItem[]; skipped: number }
  | { status: "too-large" }
  | { status: "not-a-calendar" }
  | { status: "empty" }
  | { status: "too-many" };

/** What a file read says, in the connect page's words. */
export const TODO_FILE_WORDS: Record<
  Exclude<TodoFileRead["status"], "ok">,
  string
> = {
  "too-large":
    "That file's over 2 MB. Export a shorter range of dates and try again.",
  "not-a-calendar": "That file isn't a calendar. Pick an .ics file.",
  empty: "That calendar has nothing with a date we could read.",
  "too-many": `That calendar has too much to add at once (at most ${TODO_MAX_FILE_ITEMS.toLocaleString("en-US")} items). Export a shorter range of dates and try again.`,
};

/**
 * Reads a dropped file's text into the items `todo/import-file` takes. `size`
 * is the file's size in bytes, checked before anything is parsed.
 */
export function readTodoFile(text: string, size: number): TodoFileRead {
  if (size > TODO_FILE_MAX_BYTES) return { status: "too-large" };
  const parsed = parseIcs(text, "file");
  if (!parsed.recognized) return { status: "not-a-calendar" };
  if (parsed.items.length === 0) return { status: "empty" };
  if (parsed.items.length > TODO_MAX_FILE_ITEMS) return { status: "too-many" };
  const items = parsed.items.map(
    (item): TodoFileItem => ({
      uid: item.uid,
      title: item.title,
      courseLabel: item.courseLabel,
      kind: item.kind,
      gradescope: item.gradescope,
      dueAt: item.dueAt,
      dueDate: item.dueDate,
      link: item.link,
    }),
  );
  // The request has a size limit too; long titles can pass it with fewer items.
  if (
    new TextEncoder().encode(JSON.stringify({ items })).length >
    TODO_IMPORT_MAX_BYTES
  )
    return { status: "too-many" };
  return { status: "ok", items, skipped: parsed.skipped };
}
