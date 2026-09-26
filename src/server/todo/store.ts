// D1 access for Todo (docs/V3.md §3.4). Every row read is validated. Feed rows
// are always read by naming their columns: the sealed link isn't one of
// them (only crypto.ts reads or writes it).
import { z } from "zod";
import { addDays } from "~/core/ics/dates";
import {
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
} from "~/core/schema";
import { newYorkDateOf } from "~/core/todo";
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
  exam: z.union([z.literal(0), z.literal(1)]),
  gradescope: z.union([z.literal(0), z.literal(1)]),
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
    exam: row.exam === 1,
    gradescope: row.gradescope === 1,
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
    db
      .prepare(
        `DELETE FROM todo_done WHERE user_id = ?1
         AND uid NOT IN (SELECT uid FROM todo_items WHERE user_id = ?1)`,
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
  exam: item.looksLikeExam ? 1 : 0,
  gradescope: item.gradescope ? 1 : 0,
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
  "exam",
  "gradescope",
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

/** Marks an item done (only one the person has) or not done. */
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
           SELECT ?1, ?2, ?3 WHERE EXISTS
             (SELECT 1 FROM todo_items WHERE user_id = ?1 AND uid = ?2)
           ON CONFLICT (user_id, uid) DO NOTHING`,
        )
        .bind(userId, uid, now.toISOString())
    : db
        .prepare("DELETE FROM todo_done WHERE user_id = ?1 AND uid = ?2")
        .bind(userId, uid);
  await statement.run();
}

// ---------- The daily job and the admin ----------

/**
 * Items due more than 30 days ago, and done marks whose item is gone and
 * that are over 30 days old (we don't record when an item left the feed, so
 * the mark's own age stands in for it).
 */
export async function pruneTodo(
  db: D1Database,
  now: Date,
): Promise<{ items: number; doneMarks: number }> {
  const cutoff = addDays(newYorkDateOf(now.getTime()), -TODO_WINDOW_PAST_DAYS);
  const markCutoff = new Date(
    now.getTime() - TODO_WINDOW_PAST_DAYS * 86_400_000,
  ).toISOString();
  const [items, marks] = await db.batch([
    db.prepare("DELETE FROM todo_items WHERE due_date < ?1").bind(cutoff),
    db
      .prepare(
        `DELETE FROM todo_done WHERE done_at < ?1 AND NOT EXISTS
           (SELECT 1 FROM todo_items i WHERE i.user_id = todo_done.user_id AND i.uid = todo_done.uid)`,
      )
      .bind(markCutoff),
  ]);
  return {
    items: items?.meta.changes ?? 0,
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
