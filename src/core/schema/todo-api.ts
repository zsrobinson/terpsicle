import { z } from "zod";
import {
  FeedItemKindSchema,
  FeedItemSchema,
  FeedSourceSchema,
} from "./ics-feed";
import {
  CourseCodeSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  SectionCodeSchema,
} from "./primitives";

// Terpsicle Todo's routes (docs/V3.md §3.8), all `auth: "user"`. The feed
// link goes in exactly one place, `todo/connect`'s input: nothing here that
// the server answers has a field that could hold it (V3 §5.1).

/** Items kept from 30 days ago … */
export const TODO_WINDOW_PAST_DAYS = 30;
/** … to a year ahead (V3 §3.4). */
export const TODO_WINDOW_AHEAD_DAYS = 365;
/** Feed items kept per person, at most. */
export const TODO_MAX_FEED_ITEMS = 1_500;
/** Items in one dropped file, at most (V3 §3.7). */
export const TODO_MAX_FILE_ITEMS = 1_000;
/** The longest span `todo/list` answers for. */
export const TODO_LIST_MAX_DAYS = 120;
/** The largest `todo/import-file` request, in bytes. */
export const TODO_IMPORT_MAX_BYTES = 1_048_576;

/**
 * Why a fetch failed: a code from this fixed list, never a message, because
 * `fetch()` errors and responses can carry the URL (V3 §3.5). `key` is a
 * link we couldn't decrypt (its key was retired too early).
 */
export const TodoFetchErrorSchema = z.union([
  z.enum([
    "timeout",
    "network",
    "too-large",
    "not-a-calendar",
    "bad-redirect",
    "key",
  ]),
  z.string().regex(/^http-[1-5]\d\d$/),
]);
export type TodoFetchError = z.infer<typeof TodoFetchErrorSchema>;

export const TodoFeedStatusSchema = z.enum(["active", "paused", "broken"]);
export type TodoFeedStatus = z.infer<typeof TodoFeedStatusSchema>;

/** A connected feed, as the app sees it. There's no field for the link. */
export const TodoFeedStateSchema = z.strictObject({
  source: z.literal("elms"),
  /** `broken`: ELMS stopped sharing the link; paste a new one. */
  status: TodoFeedStatusSchema,
  lastSuccessAt: IsoDateTimeSchema.nullable(),
  lastFetchAt: IsoDateTimeSchema.nullable(),
  lastError: TodoFetchErrorSchema.nullable(),
  itemCount: z.number().int().min(0),
});
export type TodoFeedState = z.infer<typeof TodoFeedStateSchema>;

/** One deadline or event, from the feed or a dropped file. */
export const TodoItemSchema = z.strictObject({
  uid: z.string().min(1).max(200),
  source: FeedSourceSchema,
  title: z.string().min(1).max(300),
  /** The ELMS course name, shown when there's no code. */
  courseLabel: z.string().min(1).max(300).nullable(),
  /**
   * The label's first course code. The app re-matches the label against the
   * person's plans (`matchFeedCourse`, then `pickFeedCourse`) for its color.
   */
  courseCode: CourseCodeSchema.nullable(),
  sectionCode: SectionCodeSchema.nullable(),
  kind: FeedItemKindSchema,
  /** The title reads like an exam or quiz: a guess, shown as "Exam". */
  exam: z.boolean(),
  /** The item mentions gradescope.com: tagged "Gradescope". */
  gradescope: z.boolean(),
  dueAt: IsoDateTimeSchema.nullable(),
  dueDate: IsoDateSchema,
  /** An ELMS URL; never any other host. */
  link: z.url().nullable(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

// ---------- POST /api/todo/connect ----------

export const TodoConnectInputSchema = z.strictObject({
  /** What was pasted; `parseFeedLink` decides whether it's a feed link. */
  url: z.string().max(2_048),
});
export type TodoConnectInput = z.infer<typeof TodoConnectInputSchema>;

export const TodoConnectResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("connected"),
    feed: TodoFeedStateSchema,
    items: z.array(TodoItemSchema),
  }),
  z.strictObject({ status: z.literal("invalid-link") }),
  /** ELMS didn't answer (a timeout, a network error, a 5xx). */
  z.strictObject({ status: z.literal("unreachable") }),
  /** It answered, but not with a calendar (a 4xx or some other page). */
  z.strictObject({ status: z.literal("not-a-calendar") }),
]);
export type TodoConnectResult = z.infer<typeof TodoConnectResultSchema>;

// ---------- POST /api/todo/disconnect ----------

export const TodoDisconnectInputSchema = z.strictObject({});
export const TodoDisconnectResultSchema = z.strictObject({
  status: z.literal("disconnected"),
});
export type TodoDisconnectResult = z.infer<typeof TodoDisconnectResultSchema>;

// ---------- POST /api/todo/list ----------

const DAY_MS = 86_400_000;

export const TodoListInputSchema = z
  .strictObject({ from: IsoDateSchema, to: IsoDateSchema })
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
      return days >= 0 && days <= TODO_LIST_MAX_DAYS;
    },
    { message: `At most ${TODO_LIST_MAX_DAYS} days, from before to` },
  );
export type TodoListInput = z.infer<typeof TodoListInputSchema>;

export const TodoListResultSchema = z.strictObject({
  /** Null until ELMS is connected (file items can still be listed). */
  feed: TodoFeedStateSchema.nullable(),
  /** Items due from `from` through `to`, by date then time. */
  items: z.array(TodoItemSchema),
  /** The UIDs among `items` marked done. */
  done: z.array(z.string()),
});
export type TodoListResult = z.infer<typeof TodoListResultSchema>;

// ---------- POST /api/todo/done ----------

export const TodoDoneInputSchema = z.strictObject({
  uid: z.string().min(1).max(200),
  done: z.boolean(),
});
export type TodoDoneInput = z.infer<typeof TodoDoneInputSchema>;
export const TodoDoneResultSchema = z.strictObject({ status: z.literal("ok") });
export type TodoDoneResult = z.infer<typeof TodoDoneResultSchema>;

// ---------- POST /api/todo/refresh ----------

export const TodoRefreshInputSchema = z.strictObject({});
export const TodoRefreshResultSchema = z.strictObject({
  /** `too-soon`: fetched in the last 5 minutes; `failed`: see `feed.lastError`. */
  status: z.enum(["fetched", "too-soon", "failed"]),
  feed: TodoFeedStateSchema.nullable(),
});
export type TodoRefreshResult = z.infer<typeof TodoRefreshResultSchema>;

// ---------- POST /api/todo/import-file ----------

/**
 * One item from a dropped file, parsed in the browser with `parseIcs`: only
 * the structured fields, never the file's text or descriptions (V3 §3.7).
 * The server re-derives the course codes and the exam guess from the words.
 */
export const TodoFileItemSchema = FeedItemSchema.pick({
  uid: true,
  title: true,
  courseLabel: true,
  kind: true,
  gradescope: true,
  dueAt: true,
  dueDate: true,
  link: true,
}).strict();
export type TodoFileItem = z.infer<typeof TodoFileItemSchema>;

export const TodoImportFileInputSchema = z.strictObject({
  items: z.array(TodoFileItemSchema).max(TODO_MAX_FILE_ITEMS),
});
export type TodoImportFileInput = z.infer<typeof TodoImportFileInputSchema>;

export const TodoImportFileResultSchema = z.strictObject({
  status: z.literal("imported"),
  added: z.number().int().min(0),
  /** Already on the ELMS feed, outside the dates we keep, or repeated. */
  skipped: z.number().int().min(0),
});
export type TodoImportFileResult = z.infer<typeof TodoImportFileResultSchema>;
