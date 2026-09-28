// The inbox's rows in D1 (`notifications`, migrations/0016; V2.md §6.7):
// writing them (notify() does, for every type), a group's unread state for
// the grouped push, the unread count for the badge and the bar, a page of
// items, and reading them.
//
// A group's rows that are unread, or were read together (they share
// `read_at`), are one inbox item: its newest row gives the item's id and
// words, and its rows' counts add up.
import { z } from "zod";
import {
  type GroupedEvent,
  INBOX_PRODUCT,
  inboxCursor,
  readInboxCursor,
  todoDueTag,
} from "~/core/notifications";
import {
  INBOX_PAGE_SIZE,
  InboxProductSchema,
  type InboxType,
  InboxTypeSchema,
  type NotificationsReadInput,
} from "~/core/schema/notifications";

/** One row a notification writes. */
export interface InboxRow {
  /** The event's key, unique per person: a retried job writes nothing twice. */
  id: string;
  /** Its group: the push tag (`chatMentionTag`, `seatTag`, …). */
  groupKey: string;
  /** Events it stands for ("3 things due tomorrow"); 1 when absent. */
  count?: number;
  /** Words, for types whose words aren't user-written (never chat). */
  title?: string;
  body?: string;
  /** Seats: the section, for a group's list. */
  label?: string;
  /** Where it opens; chat's is built from its room when read. */
  url?: string;
  /** Chat and seats: reading the course reads its seat rows. */
  termId?: string;
  courseCode?: string;
  /** Chat: the message it's about. D1 never holds its text. */
  chat?: {
    roomId: string;
    threadId: string | null;
    seq: number;
    messageId: string;
    actorId: string;
  };
}

/** Writes a notification's rows. Returns the ids that are new (none: it was written before). */
export async function writeInboxRows(
  db: D1Database,
  userId: string,
  type: InboxType,
  rows: readonly InboxRow[],
  now: Date,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const at = now.toISOString();
  const results = await db.batch<{ id: string }>(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO notifications
             (id, user_id, type, product, group_key, count, title, body, label, url,
              term_id, course_code, room_id, thread_id, seq, message_id, actor_id, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
        )
        .bind(
          row.id,
          userId,
          type,
          INBOX_PRODUCT[type],
          row.groupKey,
          row.count ?? 1,
          row.title ?? null,
          row.body ?? null,
          row.label ?? null,
          row.url ?? null,
          row.termId ?? null,
          row.courseCode ?? null,
          row.chat?.roomId ?? null,
          row.chat?.threadId ?? null,
          row.chat?.seq ?? null,
          row.chat?.messageId ?? null,
          row.chat?.actorId ?? null,
          at,
        ),
    ),
  );
  return results.flatMap((r) => r.results.map((x) => x.id));
}

const GroupRowSchema = z.object({
  id: z.string(),
  count: z.number().int(),
  label: z.string().nullable(),
  actor_id: z.string().nullable(),
  created_at: z.string(),
});

/** A group's rows unread at once, at most (a group this big is words, not a list). */
const GROUP_ROWS_MAX = 500;

/**
 * A group's unread state now, for its push: how many events it stands for,
 * its sections (newest first), and its events other than `newIds`.
 */
export async function groupState(
  db: D1Database,
  userId: string,
  groupKey: string,
  newIds: readonly string[],
): Promise<{
  count: number;
  labels: string[];
  events: GroupedEvent[];
  others: GroupedEvent[];
}> {
  const { results } = await db
    .prepare(
      `SELECT id, count, label, actor_id, created_at FROM notifications
       WHERE user_id = ?1 AND group_key = ?2 AND read_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT ?3`,
    )
    .bind(userId, groupKey, GROUP_ROWS_MAX)
    .all();
  const rows = results.map((r) => GroupRowSchema.parse(r));
  const fresh = new Set(newIds);
  const event = (r: z.infer<typeof GroupRowSchema>): GroupedEvent => ({
    actorId: r.actor_id,
    createdAt: r.created_at,
  });
  return {
    count: rows.reduce((n, r) => n + r.count, 0),
    labels: rows.flatMap((r) => (r.label === null ? [] : [r.label])),
    events: rows.filter((r) => fresh.has(r.id)).map(event),
    others: rows.filter((r) => !fresh.has(r.id)).map(event),
  };
}

/** Events of `type` this person's inbox got since `since`, read or not (seat alerts' daily cap). */
export async function countInboxEvents(
  db: D1Database,
  userId: string,
  type: InboxType,
  since: Date,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications
       WHERE user_id = ?1 AND type = ?2 AND created_at >= ?3`,
    )
    .bind(userId, type, since.toISOString())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Unread items (groups with an unread row): the bell's count and the app badge. Cheap. */
export async function unreadCount(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT group_key) AS n FROM notifications
       WHERE user_id = ?1 AND read_at IS NULL`,
    )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

const ItemRowSchema = z.object({
  id: z.string(),
  type: InboxTypeSchema,
  product: InboxProductSchema,
  group_key: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  term_id: z.string().nullable(),
  course_code: z.string().nullable(),
  room_id: z.string().nullable(),
  thread_id: z.string().nullable(),
  message_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
  n: z.number().int(),
  labels: z.string(),
});
export type InboxItemRow = Omit<z.infer<typeof ItemRowSchema>, "labels"> & {
  labels: string[];
};

function itemRow(r: unknown): InboxItemRow | null {
  const row = ItemRowSchema.safeParse(r);
  if (!row.success) return null;
  const labels = z.array(z.string()).safeParse(JSON.parse(row.data.labels));
  return { ...row.data, labels: labels.success ? labels.data : [] };
}

/**
 * One page of the inbox, newest first: each group's unread rows as one
 * item, and its rows read together as another. `before` is the previous
 * page's cursor. One more than a page is read, to know there's a next.
 */
export async function inboxPage(
  db: D1Database,
  userId: string,
  before: string | undefined,
): Promise<{ rows: InboxItemRow[]; next: string | null }> {
  const cursor = before === undefined ? null : readInboxCursor(before);
  // A single max() makes SQLite take the other bare columns from the
  // newest row of each group (https://sqlite.org/lang_select.html#bareagg).
  const { results } = await db
    .prepare(
      `WITH items AS (
         SELECT id, type, product, group_key, title, body, url, term_id,
                course_code, room_id, thread_id, message_id, actor_id,
                MAX(created_at) AS created_at, read_at, SUM(count) AS n,
                json_group_array(label) FILTER (WHERE label IS NOT NULL) AS labels
         FROM (SELECT * FROM notifications WHERE user_id = ?1
               ORDER BY created_at DESC, id DESC)
         GROUP BY group_key, COALESCE(read_at, '')
       )
       SELECT i.*, u.name AS actor_name FROM items i
       LEFT JOIN users u ON u.id = i.actor_id
       WHERE ?2 IS NULL OR i.created_at < ?2 OR (i.created_at = ?2 AND i.id < ?3)
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ?4`,
    )
    .bind(
      userId,
      cursor?.createdAt ?? null,
      cursor?.id ?? null,
      INBOX_PAGE_SIZE + 1,
    )
    .all();
  // A row that doesn't read is left out, not fatal: the rest still show.
  const rows = results.flatMap((r) => itemRow(r) ?? []);
  const page = rows.slice(0, INBOX_PAGE_SIZE);
  const last = page.at(-1);
  return {
    rows: page,
    next:
      rows.length > INBOX_PAGE_SIZE && last
        ? inboxCursor({ createdAt: last.created_at, id: last.id })
        : null,
  };
}

/**
 * Marks rows read, all at the same time, so each read item stays one
 * item. Ids read their whole item: the group's unread rows up to the
 * newest the id names (not one that arrived since). Returns unread after.
 */
export async function markRead(
  db: D1Database,
  userId: string,
  input: NotificationsReadInput,
  now: Date,
): Promise<number> {
  const at = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  const update = (where: string, ...args: unknown[]) =>
    statements.push(
      db
        .prepare(
          `UPDATE notifications SET read_at = ?2
           WHERE user_id = ?1 AND read_at IS NULL AND ${where}`,
        )
        .bind(userId, at, ...args),
    );
  if (input.all) update("1 = 1");
  if (input.ids)
    update(
      `EXISTS (SELECT 1 FROM notifications r
               WHERE r.user_id = ?1 AND r.id IN (SELECT value FROM json_each(?3))
                 AND r.group_key = notifications.group_key
                 AND r.created_at >= notifications.created_at)`,
      JSON.stringify(input.ids),
    );
  if (input.course)
    update(
      "type = 'seat-open' AND term_id = ?3 AND course_code = ?4",
      input.course.termId,
      input.course.courseCode,
    );
  if (input.day) update("group_key = ?3", todoDueTag(input.day));
  if (statements.length > 0) await db.batch(statements);
  return unreadCount(db, userId);
}

// ---------- Quiet hours (V2 §6.7) ----------

/** Marks rows whose push waits for 8am. */
export async function holdPush(
  db: D1Database,
  userId: string,
  ids: readonly string[],
  now: Date,
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .prepare(
      `UPDATE notifications SET push_held_at = ?3
       WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(userId, JSON.stringify(ids), now.toISOString())
    .run();
}

const HeldGroupSchema = z.object({
  user_id: z.string(),
  group_key: z.string(),
});

/** Groups with a push waiting, at most `limit` (a later run takes the rest). */
export async function heldGroups(
  db: D1Database,
  limit: number,
): Promise<{ userId: string; groupKey: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT user_id, group_key FROM notifications
       WHERE push_held_at IS NOT NULL LIMIT ?1`,
    )
    .bind(limit)
    .all();
  return results.flatMap((r) => {
    const row = HeldGroupSchema.safeParse(r);
    return row.success
      ? [{ userId: row.data.user_id, groupKey: row.data.group_key }]
      : [];
  });
}

/**
 * Takes a group's waiting push: clears its marks in one statement, so two
 * runs can't both send it. True when one of them is still unread (read
 * since, it sends nothing).
 */
export async function takeHeldGroup(
  db: D1Database,
  userId: string,
  groupKey: string,
): Promise<boolean> {
  const { results } = await db
    .prepare(
      `UPDATE notifications SET push_held_at = NULL
       WHERE user_id = ?1 AND group_key = ?2 AND push_held_at IS NOT NULL
       RETURNING read_at`,
    )
    .bind(userId, groupKey)
    .all<{ read_at: string | null }>();
  return results.some((r) => r.read_at === null);
}

/** A group's unread rows as one inbox item (as `inboxPage` makes it), or null. */
export async function unreadGroupItem(
  db: D1Database,
  userId: string,
  groupKey: string,
): Promise<InboxItemRow | null> {
  const row = await db
    .prepare(
      `WITH items AS (
         SELECT id, type, product, group_key, title, body, url, term_id,
                course_code, room_id, thread_id, message_id, actor_id,
                MAX(created_at) AS created_at, read_at, SUM(count) AS n,
                json_group_array(label) FILTER (WHERE label IS NOT NULL) AS labels
         FROM (SELECT * FROM notifications
               WHERE user_id = ?1 AND group_key = ?2 AND read_at IS NULL
               ORDER BY created_at DESC, id DESC)
         GROUP BY group_key
       )
       SELECT i.*, u.name AS actor_name FROM items i
       LEFT JOIN users u ON u.id = i.actor_id`,
    )
    .bind(userId, groupKey)
    .first();
  return row ? itemRow(row) : null;
}
