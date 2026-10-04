// D1 access for Todo (docs/V3.md §3.4). Every row read is validated. Feed rows
// are always read by naming their columns: the sealed link isn't one of
// them (only crypto.ts reads or writes it).
import { z } from "zod";
import { addDays } from "~/core/ics/dates";
import {
  type CourseCode,
  CourseCodeSchema,
  type FeedItem,
  FeedItemKindSchema,
  FeedSourceSchema,
  type IsoDate,
  IsoDateSchema,
  IsoDateTimeSchema,
  SectionCodeSchema,
  TODO_WINDOW_PAST_DAYS,
  type TodoFeedState,
  TodoFeedStatusSchema,
  type TodoFetchError,
  TodoFetchErrorSchema,
  type TodoItem,
  TodoTaskUidSchema,
} from "~/core/schema";
import { newYorkDateOf, ownTaskItem } from "~/core/todo";
import { isSealed, UNSEALED } from "../security/seal";
import {
  type AccountKey,
  openForAccount,
  SealedDataError,
  sealForAccount,
  type UserData,
} from "../security/user-keys";
import type { FeedOwner } from "./crypto";

export const TodoFeedRowSchema = z.object({
  user_id: z.string(),
  source: z.literal("elms"),
  status: TodoFeedStatusSchema,
  created_at: IsoDateTimeSchema,
  next_fetch_at: IsoDateTimeSchema,
  last_fetch_at: IsoDateTimeSchema.nullable(),
  last_success_at: IsoDateTimeSchema.nullable(),
  failure_count: z.number().int().min(0),
  last_error: TodoFetchErrorSchema.nullable().catch(null),
  gone_strikes: z.number().int().min(0),
  gone_at: IsoDateTimeSchema.nullable(),
  etag: z.string().nullable(),
  last_modified: z.string().nullable(),
  content_hash: z.string().nullable(),
  item_count: z.number().int().min(0),
  last_opened_at: IsoDateTimeSchema,
});
export type TodoFeedRow = z.infer<typeof TodoFeedRowSchema>;

const FEED_COLUMNS = Object.keys(TodoFeedRowSchema.shape).join(", ");

export const TodoItemRowSchema = z.object({
  user_id: z.string(),
  uid: z.string(),
  source: FeedSourceSchema,
  title: z.string(),
  course_label: z.string().nullable(),
  course_code: CourseCodeSchema.nullable(),
  section_code: SectionCodeSchema.nullable(),
  kind: FeedItemKindSchema,
  due_at: IsoDateTimeSchema.nullable(),
  due_date: IsoDateSchema,
  link: z.string().nullable(),
  first_seen_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type TodoItemRow = z.infer<typeof TodoItemRowSchema>;

export const feedOwner = (row: TodoFeedRow): FeedOwner => ({
  userId: row.user_id,
  source: row.source,
});

export function feedState(row: TodoFeedRow): TodoFeedState {
  return {
    source: row.source,
    status: row.status,
    lastSuccessAt: row.last_success_at,
    lastFetchAt: row.last_fetch_at,
    lastError: row.last_error,
    itemCount: row.item_count,
  };
}

function toItem(row: TodoItemRow): TodoItem {
  return {
    uid: row.uid,
    source: row.source,
    title: row.title,
    courseLabel: row.course_label,
    courseCode: row.course_code,
    sectionCode: row.section_code,
    kind: row.kind,
    dueAt: row.due_at,
    dueDate: row.due_date,
    link: row.link,
  };
}

// ---------- Feeds ----------

export async function getFeed(
  db: D1Database,
  userId: string,
): Promise<TodoFeedRow | null> {
  const row = await db
    .prepare(
      `SELECT ${FEED_COLUMNS} FROM todo_feeds WHERE user_id = ?1 AND source = 'elms'`,
    )
    .bind(userId)
    .first();
  return row ? TodoFeedRowSchema.parse(row) : null;
}

/**
 * "Due tomorrow" was turned on: a feed paused while it was off (V3.md
 * §3.5) is active again and fetched at the next run, so the reminder has
 * fresh items to read.
 */
export async function resumePausedFeed(
  db: D1Database,
  userId: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      `UPDATE todo_feeds SET status = 'active', next_fetch_at = ?2
       WHERE user_id = ?1 AND status = 'paused'`,
    )
    .bind(userId, now.toISOString())
    .run();
}

/** Active feeds due by `now`, the longest-waiting first. */
export async function dueFeeds(
  db: D1Database,
  now: Date,
  limit: number,
): Promise<TodoFeedRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${FEED_COLUMNS} FROM todo_feeds
       WHERE status = 'active' AND next_fetch_at <= ?1
       ORDER BY next_fetch_at LIMIT ?2`,
    )
    .bind(now.toISOString(), limit)
    .all();
  return results.map((r) => TodoFeedRowSchema.parse(r));
}

/** What a fetch that worked changes on the feed row. */
export interface FeedSuccess {
  now: Date;
  /** `paused` stops the cron fetching it until /todo is opened. */
  next: { status: "active"; at: Date } | { status: "paused" };
  /** A new body's validators and hash; null keeps the stored ones (a 304). */
  body: {
    etag: string | null;
    lastModified: string | null;
    hash: string;
  } | null;
  /** Set when the items were rewritten. */
  itemCount: number | null;
  /** The person has /todo open: this counts as opening it. */
  opened: boolean;
}

export function feedSuccessStatement(
  db: D1Database,
  owner: FeedOwner,
  s: FeedSuccess,
): D1PreparedStatement {
  const at = s.now.toISOString();
  return db
    .prepare(
      `UPDATE todo_feeds SET
         status = ?3, next_fetch_at = ?4, last_fetch_at = ?5, last_success_at = ?5,
         failure_count = 0, last_error = NULL, gone_strikes = 0, gone_at = NULL,
         etag = CASE WHEN ?6 THEN ?7 ELSE etag END,
         last_modified = CASE WHEN ?6 THEN ?8 ELSE last_modified END,
         content_hash = CASE WHEN ?6 THEN ?9 ELSE content_hash END,
         item_count = COALESCE(?10, item_count),
         last_opened_at = CASE WHEN ?11 THEN ?5 ELSE last_opened_at END
       WHERE user_id = ?1 AND source = ?2`,
    )
    .bind(
      owner.userId,
      owner.source,
      s.next.status,
      s.next.status === "active" ? s.next.at.toISOString() : at,
      at,
      s.body ? 1 : 0,
      s.body?.etag ?? null,
      s.body?.lastModified ?? null,
      s.body?.hash ?? null,
      s.itemCount,
      s.opened ? 1 : 0,
    );
}

export interface FeedFailure {
  now: Date;
  code: TodoFetchError;
  failures: number;
  goneStrikes: number;
  goneAt: Date | null;
  broken: boolean;
  nextAt: Date;
  opened: boolean;
}

export function feedFailureStatement(
  db: D1Database,
  owner: FeedOwner,
  f: FeedFailure,
): D1PreparedStatement {
  const at = f.now.toISOString();
  return db
    .prepare(
      `UPDATE todo_feeds SET
         status = CASE WHEN ?3 THEN 'broken' ELSE status END,
         next_fetch_at = ?4, last_fetch_at = ?5, failure_count = ?6, last_error = ?7,
         gone_strikes = ?8, gone_at = ?9,
         last_opened_at = CASE WHEN ?10 THEN ?5 ELSE last_opened_at END
       WHERE user_id = ?1 AND source = ?2`,
    )
    .bind(
      owner.userId,
      owner.source,
      f.broken ? 1 : 0,
      f.nextAt.toISOString(),
      at,
      f.failures,
      f.code,
      f.goneStrikes,
      f.goneAt?.toISOString() ?? null,
      f.opened ? 1 : 0,
    );
}

/**
 * The person opened /todo: noted at most once an hour (it sets the cadence),
 * and a paused feed is active again and due at once.
 */
export async function markOpened(
  db: D1Database,
  row: TodoFeedRow,
  now: Date,
  minGapMs: number,
): Promise<TodoFeedRow> {
  const stale = now.getTime() - Date.parse(row.last_opened_at) >= minGapMs;
  if (!stale && row.status !== "paused") return row;
  const at = now.toISOString();
  const resume = row.status === "paused";
  await db
    .prepare(
      `UPDATE todo_feeds SET last_opened_at = ?3,
         status = CASE WHEN status = 'paused' THEN 'active' ELSE status END,
         next_fetch_at = CASE WHEN status = 'paused' THEN ?3 ELSE next_fetch_at END
       WHERE user_id = ?1 AND source = ?2`,
    )
    .bind(row.user_id, row.source, at)
    .run();
  return {
    ...row,
    last_opened_at: at,
    ...(resume ? { status: "active" as const, next_fetch_at: at } : {}),
  };
}

/** Disconnecting: the feed, its items, and done marks for anything but file items. */
export function disconnectStatements(
  db: D1Database,
  userId: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare("DELETE FROM todo_feeds WHERE user_id = ?1 AND source = 'elms'")
      .bind(userId),
    db
      .prepare("DELETE FROM todo_items WHERE user_id = ?1 AND source = 'elms'")
      .bind(userId),
    // Own tasks keep theirs: they aren't ELMS's.
    db
      .prepare(
        `DELETE FROM todo_done WHERE user_id = ?1
         AND uid NOT IN (SELECT uid FROM todo_items WHERE user_id = ?1)
         AND uid NOT IN (SELECT uid FROM todo_tasks WHERE user_id = ?1)`,
      )
      .bind(userId),
  ];
}

// ---------- Items ----------

const ITEM_JSON = (item: FeedItem) => ({
  uid: item.uid,
  title: item.title,
  course_label: item.courseLabel,
  course_code: item.courseCodes[0] ?? null,
  section_code: item.sectionCode,
  kind: item.kind,
  due_at: item.dueAt,
  due_date: item.dueDate,
  link: item.link,
});

const CHANGED = [
  "title",
  "course_label",
  "course_code",
  "section_code",
  "kind",
  "due_at",
  "due_date",
  "link",
];

/**
 * Makes a source's items exactly `items`, in two statements whatever their
 * number: an upsert that writes only rows that changed, and a delete of the
 * ones that are gone. Done marks aren't touched (pruning takes them later).
 * Feed items replace a file item with the same UID; file items never
 * replace a feed item.
 */
export function replaceItemsStatements(
  db: D1Database,
  userId: string,
  source: "elms" | "file",
  items: readonly FeedItem[],
  now: Date,
): D1PreparedStatement[] {
  const json = JSON.stringify(items.map(ITEM_JSON));
  const col = (name: string) => `json_extract(value, '$.${name}')`;
  const fromFile = source === "file";
  const upsert = db
    .prepare(
      `INSERT INTO todo_items (user_id, uid, source, ${CHANGED.join(", ")}, first_seen_at, updated_at)
       SELECT ?1, ${col("uid")}, ?2, ${CHANGED.map(col).join(", ")}, ?3, ?3
       FROM json_each(?4)
       WHERE ${
         fromFile
           ? `NOT EXISTS (SELECT 1 FROM todo_items t WHERE t.user_id = ?1 AND t.uid = ${col("uid")} AND t.source = 'elms')`
           : "true"
       }
       ON CONFLICT (user_id, uid) DO UPDATE SET
         source = excluded.source,
         ${CHANGED.map((c) => `${c} = excluded.${c}`).join(", ")},
         updated_at = excluded.updated_at
       WHERE ${fromFile ? "todo_items.source = 'file' AND " : ""}(todo_items.source IS NOT excluded.source OR ${CHANGED.map(
         (c) => `todo_items.${c} IS NOT excluded.${c}`,
       ).join(" OR ")})`,
    )
    .bind(userId, source, now.toISOString(), json);
  const prune = db
    .prepare(
      `DELETE FROM todo_items WHERE user_id = ?1 AND source = ?2
       AND uid NOT IN (SELECT ${col("uid")} FROM json_each(?3))`,
    )
    .bind(userId, source, json);
  return [upsert, prune];
}

/** The UIDs of a person's feed items. */
export async function feedItemUids(
  db: D1Database,
  userId: string,
): Promise<Set<string>> {
  const { results } = await db
    .prepare(
      "SELECT uid FROM todo_items WHERE user_id = ?1 AND source = 'elms'",
    )
    .bind(userId)
    .all<{ uid: unknown }>();
  return new Set(
    results.flatMap((r) => (typeof r.uid === "string" ? [r.uid] : [])),
  );
}

/** Items due from `from` through `to` (all of them without a range), soonest first. */
export async function listItems(
  db: D1Database,
  userId: string,
  range: { from: IsoDate; to: IsoDate } | null,
): Promise<TodoItem[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM todo_items WHERE user_id = ?1
       AND (?2 IS NULL OR due_date BETWEEN ?2 AND ?3)
       ORDER BY due_date, due_at IS NOT NULL, due_at, title, uid`,
    )
    .bind(userId, range?.from ?? null, range?.to ?? null)
    .all();
  return results.map((r) => toItem(TodoItemRowSchema.parse(r)));
}

/** Of these items, the ones marked done. */
export async function doneAmong(
  db: D1Database,
  userId: string,
  uids: readonly string[],
): Promise<string[]> {
  if (uids.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT uid FROM todo_done WHERE user_id = ?1
       AND uid IN (SELECT value FROM json_each(?2)) ORDER BY uid`,
    )
    .bind(userId, JSON.stringify(uids))
    .all<{ uid: unknown }>();
  return results.flatMap((r) => (typeof r.uid === "string" ? [r.uid] : []));
}

/** Marks an item or own task done (only one the person has) or not done. */
export async function setDone(
  db: D1Database,
  userId: string,
  uid: string,
  done: boolean,
  now: Date,
): Promise<void> {
  const statement = done
    ? db
        .prepare(
          `INSERT INTO todo_done (user_id, uid, done_at)
           SELECT ?1, ?2, ?3 WHERE
             EXISTS (SELECT 1 FROM todo_items WHERE user_id = ?1 AND uid = ?2)
             OR EXISTS (SELECT 1 FROM todo_tasks WHERE user_id = ?1 AND uid = ?2)
           ON CONFLICT (user_id, uid) DO NOTHING`,
        )
        .bind(userId, uid, now.toISOString())
    : db
        .prepare("DELETE FROM todo_done WHERE user_id = ?1 AND uid = ?2")
        .bind(userId, uid);
  await statement.run();
}

// ---------- Own tasks ----------

// A task's title is what the person typed, so it's sealed with their
// account's key, bound to the task (docs/DATA.md §7.7). Dates and the course
// stay plain: the due-tomorrow job and the calendar feed select by them. A
// title in plain text (saved by the build before sealing, between the
// migration and the deploy) is never read: the task is deleted on sight.

export const TodoTaskRowSchema = z.object({
  user_id: z.string(),
  uid: TodoTaskUidSchema,
  title: z.string().min(1),
  course_code: CourseCodeSchema.nullable(),
  due_at: IsoDateTimeSchema.nullable(),
  due_date: IsoDateSchema.nullable(),
  created_at: IsoDateTimeSchema,
  updated_at: IsoDateTimeSchema,
});
export type TodoTaskRow = z.infer<typeof TodoTaskRowSchema>;

/** Where a title lives: what it's bound to, after the account's id. */
export const titleWhere = (uid: string) => ["todo-task", uid];

/** A task's title sealed for its row, as `upsertTask` stores it. */
export function sealTaskTitle(
  account: AccountKey,
  uid: string,
  title: string,
): Promise<string> {
  return sealForAccount(account, titleWhere(uid), title);
}

/**
 * Deletes these tasks, whose titles are in plain text, with their done
 * marks (each only while its title is still the one read). Logs how many,
 * never what.
 */
async function dropUnsealedTasks(
  db: D1Database,
  userId: string,
  rows: readonly TodoTaskRow[],
): Promise<void> {
  const results = await db.batch(
    rows.flatMap((r) => [
      db
        .prepare(
          `DELETE FROM todo_done WHERE user_id = ?1 AND uid = ?2
           AND EXISTS (SELECT 1 FROM todo_tasks WHERE user_id = ?1 AND uid = ?2 AND title = ?3)`,
        )
        .bind(userId, r.uid, r.title),
      db
        .prepare(
          "DELETE FROM todo_tasks WHERE user_id = ?1 AND uid = ?2 AND title = ?3",
        )
        .bind(userId, r.uid, r.title),
    ]),
  );
  const dropped = results
    .filter((_, i) => i % 2 === 1)
    .reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  console.warn({ todo: "deleted tasks saved in plain text", dropped });
}

/**
 * The daily job's sweep for plain-text titles nobody has listed since: the
 * same as on sight, for everyone. Returns how many tasks went.
 */
export async function sweepUnsealedTasks(db: D1Database): Promise<number> {
  const [, deleted] = await db.batch([
    db.prepare(
      `DELETE FROM todo_done WHERE EXISTS (
         SELECT 1 FROM todo_tasks t
         WHERE t.user_id = todo_done.user_id AND t.uid = todo_done.uid
           AND ${UNSEALED("t.title")})`,
    ),
    db.prepare(`DELETE FROM todo_tasks WHERE ${UNSEALED("title")}`),
  ]);
  return deleted?.meta.changes ?? 0;
}

/** The row with its title opened; throws if it won't open. */
async function openTask(
  account: AccountKey | null,
  row: TodoTaskRow,
): Promise<TodoTaskRow> {
  if (!account) throw new SealedDataError();
  return {
    ...row,
    title: await openForAccount(account, titleWhere(row.uid), row.title),
  };
}

const toTaskItem = (row: TodoTaskRow): TodoItem =>
  ownTaskItem({
    uid: row.uid,
    title: row.title,
    courseCode: row.course_code,
    dueAt: row.due_at,
    dueDate: row.due_date,
  });

/** SQLite's order for these columns: nulls first, then by code unit. */
const compareNullable = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;

/**
 * Soonest first: dated before undated, then by date, untimed before timed,
 * by time, then by title (only readable once opened) and uid.
 */
function compareTasks(a: TodoTaskRow, b: TodoTaskRow): number {
  return (
    Number(a.due_date === null) - Number(b.due_date === null) ||
    compareNullable(a.due_date, b.due_date) ||
    Number(a.due_at !== null) - Number(b.due_at !== null) ||
    compareNullable(a.due_at, b.due_at) ||
    compareNullable(a.title, b.title) ||
    compareNullable(a.uid, b.uid)
  );
}

/**
 * A person's own tasks due from `from` through `to` (all dated ones without
 * a range), and with `undated`, the ones with no date too. Soonest first.
 */
export async function listTasks(
  data: UserData,
  userId: string,
  range: { from: IsoDate; to: IsoDate } | null,
  { undated }: { undated: boolean },
): Promise<TodoItem[]> {
  const { results } = await data.db
    .prepare(
      `SELECT * FROM todo_tasks WHERE user_id = ?1
       AND ((due_date IS NOT NULL AND (?2 IS NULL OR due_date BETWEEN ?2 AND ?3))
            OR (?4 AND due_date IS NULL))`,
    )
    .bind(userId, range?.from ?? null, range?.to ?? null, undated ? 1 : 0)
    .all();
  const all = results.map((r) => TodoTaskRowSchema.parse(r));
  const plain = all.filter((r) => !isSealed(r.title));
  if (plain.length > 0) await dropUnsealedTasks(data.db, userId, plain);
  const sealed = all.filter((r) => isSealed(r.title));
  if (sealed.length === 0) return [];
  const account = await data.accountKey(userId);
  const rows = await Promise.all(sealed.map((r) => openTask(account, r)));
  return rows.sort(compareTasks).map(toTaskItem);
}

/** A task as it's saved: its New York date and the instant, when it has a time. */
export interface TaskToSave {
  uid: string;
  title: string;
  courseCode: CourseCode | null;
  dueAt: string | null;
  dueDate: IsoDate | null;
}

/**
 * Adds a task or changes the person's task with that uid. A new one past
 * `max` isn't added: the answer is null then. The account's key is made
 * with its first task if it has none yet.
 */
export async function upsertTask(
  data: UserData,
  userId: string,
  task: TaskToSave,
  now: Date,
  max: number,
): Promise<TodoItem | null> {
  const at = now.toISOString();
  const account = await data.accountKey(userId, { create: true });
  if (!account) throw new SealedDataError();
  const title = await sealTaskTitle(account, task.uid, task.title);
  const row = await data.db
    .prepare(
      `INSERT INTO todo_tasks (user_id, uid, title, course_code, due_at, due_date, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
       WHERE (SELECT COUNT(*) FROM todo_tasks WHERE user_id = ?1) < ?8
          OR EXISTS (SELECT 1 FROM todo_tasks WHERE user_id = ?1 AND uid = ?2)
       ON CONFLICT (user_id, uid) DO UPDATE SET
         title = excluded.title, course_code = excluded.course_code,
         due_at = excluded.due_at, due_date = excluded.due_date,
         updated_at = excluded.updated_at
       RETURNING *`,
    )
    .bind(
      userId,
      task.uid,
      title,
      task.courseCode,
      task.dueAt,
      task.dueDate,
      at,
      max,
    )
    .first();
  return row
    ? toTaskItem(await openTask(account, TodoTaskRowSchema.parse(row)))
    : null;
}

/** Deletes one of the person's tasks, and its done mark with it. */
export function deleteTaskStatements(
  db: D1Database,
  userId: string,
  uid: string,
): D1PreparedStatement[] {
  return [
    // The mark first, and only for a task that's theirs: a uid can't
    // reach an ELMS item's mark.
    db
      .prepare(
        `DELETE FROM todo_done WHERE user_id = ?1 AND uid = ?2
         AND EXISTS (SELECT 1 FROM todo_tasks WHERE user_id = ?1 AND uid = ?2)`,
      )
      .bind(userId, uid),
    db
      .prepare("DELETE FROM todo_tasks WHERE user_id = ?1 AND uid = ?2")
      .bind(userId, uid),
  ];
}

// ---------- Hidden courses ----------

/** The course groups a person hid, by key. */
export async function hiddenCourses(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT course_key FROM todo_hidden WHERE user_id = ?1 ORDER BY course_key",
    )
    .bind(userId)
    .all<{ course_key: unknown }>();
  return results.flatMap((r) =>
    typeof r.course_key === "string" ? [r.course_key] : [],
  );
}

/** Hides a course group (at most `max` of them) or shows it again. */
export async function setCourseHidden(
  db: D1Database,
  userId: string,
  key: string,
  hidden: boolean,
  now: Date,
  max: number,
): Promise<void> {
  const statement = hidden
    ? db
        .prepare(
          `INSERT INTO todo_hidden (user_id, course_key, hidden_at)
           SELECT ?1, ?2, ?3
           WHERE (SELECT COUNT(*) FROM todo_hidden WHERE user_id = ?1) < ?4
           ON CONFLICT (user_id, course_key) DO NOTHING`,
        )
        .bind(userId, key, now.toISOString(), max)
    : db
        .prepare(
          "DELETE FROM todo_hidden WHERE user_id = ?1 AND course_key = ?2",
        )
        .bind(userId, key);
  await statement.run();
}

/**
 * SQL that's true when item row `i` (with `user_id`, `course_code` and
 * `course_label`) is in a course its person hid: by its code, its ELMS
 * course name, or any course code in that name (a cross-listed item), as
 * `isHiddenItem` reads it in the app.
 */
export const IN_HIDDEN_COURSE = (i: string) =>
  `EXISTS (SELECT 1 FROM todo_hidden h WHERE h.user_id = ${i}.user_id
     AND (h.course_key = ${i}.course_code OR h.course_key = ${i}.course_label
          OR (h.course_key GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9]*'
              AND instr(${i}.course_label, h.course_key) > 0)))`;

// ---------- The daily job and the admin ----------

/**
 * Items and own tasks due more than 30 days ago (a task with no date stays),
 * and done marks whose item or task is gone and that are over 30 days old
 * (we don't record when an item left the feed, so the mark's own age stands
 * in for it).
 */
export async function pruneTodo(
  db: D1Database,
  now: Date,
): Promise<{ items: number; tasks: number; doneMarks: number }> {
  const cutoff = addDays(newYorkDateOf(now.getTime()), -TODO_WINDOW_PAST_DAYS);
  const markCutoff = new Date(
    now.getTime() - TODO_WINDOW_PAST_DAYS * 86_400_000,
  ).toISOString();
  const [items, tasks, marks] = await db.batch([
    db.prepare("DELETE FROM todo_items WHERE due_date < ?1").bind(cutoff),
    db.prepare("DELETE FROM todo_tasks WHERE due_date < ?1").bind(cutoff),
    db
      .prepare(
        `DELETE FROM todo_done WHERE done_at < ?1
         AND NOT EXISTS (SELECT 1 FROM todo_items i WHERE i.user_id = todo_done.user_id AND i.uid = todo_done.uid)
         AND NOT EXISTS (SELECT 1 FROM todo_tasks t WHERE t.user_id = todo_done.user_id AND t.uid = todo_done.uid)`,
      )
      .bind(markCutoff),
  ]);
  return {
    items: items?.meta.changes ?? 0,
    tasks: tasks?.meta.changes ?? 0,
    doneMarks: marks?.meta.changes ?? 0,
  };
}

export const TodoHealthSchema = z.object({
  active: z.number().int(),
  paused: z.number().int(),
  broken: z.number().int(),
  /** The latest fetch of any feed: the cron's last run that did something. */
  lastFetchAt: IsoDateTimeSchema.nullable(),
});
export type TodoHealth = z.infer<typeof TodoHealthSchema>;

/** The admin health header's Todo numbers (V3 §3.5). */
export async function todoHealth(db: D1Database): Promise<TodoHealth> {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'active'), 0) AS active,
         COALESCE(SUM(status = 'paused'), 0) AS paused,
         COALESCE(SUM(status = 'broken'), 0) AS broken,
         MAX(last_fetch_at) AS lastFetchAt
       FROM todo_feeds`,
    )
    .first();
  return TodoHealthSchema.parse(row);
}
