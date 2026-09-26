// D1 for feedback (migration 0012_feedback.sql). Plain statements; the
// routes in ./api decide who may run them.
import { retentionCutoffs } from "~/core/feedback";
import {
  CLOSED_FEEDBACK_STATUSES,
  type FeedbackContext,
  FeedbackContextSchema,
  type FeedbackElement,
  FeedbackElementSchema,
  type FeedbackGroup,
  type FeedbackItem,
  type FeedbackKind,
  type FeedbackListInput,
  type FeedbackProduct,
  type FeedbackStatus,
  type PinContext,
  PinContextSchema,
} from "~/core/schema/feedback";

export interface FeedbackRow {
  id: string;
  kind: FeedbackKind;
  product: FeedbackProduct;
  path: string;
  text: string;
  expected: string | null;
  screenshot_key: string | null;
  element_shot_key: string | null;
  context: string | null;
  element: string | null;
  host: string;
  user_id: string | null;
  status: FeedbackStatus;
  group_id: string | null;
  note: string | null;
  undo_hash: string | null;
  replied_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export type NewFeedback = Pick<
  FeedbackRow,
  | "id"
  | "kind"
  | "product"
  | "path"
  | "text"
  | "expected"
  | "screenshot_key"
  | "element_shot_key"
  | "context"
  | "element"
  | "host"
  | "user_id"
  | "undo_hash"
  | "created_at"
>;

export async function insertFeedback(
  db: D1Database,
  row: NewFeedback,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO feedback (id, kind, product, path, text, expected,
         screenshot_key, element_shot_key, context, element, host, user_id,
         undo_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)`,
    )
    .bind(
      row.id,
      row.kind,
      row.product,
      row.path,
      row.text,
      row.expected,
      row.screenshot_key,
      row.element_shot_key,
      row.context,
      row.element,
      row.host,
      row.user_id,
      row.undo_hash,
      row.created_at,
    )
    .run();
}

/** A live (not deleted) item. */
export async function getFeedback(
  db: D1Database,
  id: string,
): Promise<FeedbackRow | null> {
  return db
    .prepare("SELECT * FROM feedback WHERE id = ?1 AND deleted_at IS NULL")
    .bind(id)
    .first<FeedbackRow>();
}

/** Any item, deleted or not. */
async function getAnyFeedback(
  db: D1Database,
  id: string,
): Promise<FeedbackRow | null> {
  return db
    .prepare("SELECT * FROM feedback WHERE id = ?1")
    .bind(id)
    .first<FeedbackRow>();
}

export async function deleteFeedbackRow(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.prepare("DELETE FROM feedback WHERE id = ?1").bind(id).run();
}

/** The R2 keys an item holds. */
export const imageKeys = (
  row: Pick<FeedbackRow, "screenshot_key" | "element_shot_key">,
): string[] =>
  [row.screenshot_key, row.element_shot_key].filter(
    (k): k is string => k !== null,
  );

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A stored context, checked against its kind's schema; null if it isn't one. */
function parseContext(
  kind: FeedbackKind,
  text: string | null,
): FeedbackContext | PinContext | null {
  const json = parseJson(text);
  if (json === null) return null;
  const parsed =
    kind === "review"
      ? PinContextSchema.safeParse(json)
      : FeedbackContextSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function parseElement(text: string | null): FeedbackElement | null {
  const parsed = FeedbackElementSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
}

/** What the owner sees: whether a reply may go, never to whom. */
export function toItem(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    kind: row.kind,
    product: row.product,
    path: row.path,
    text: row.text,
    expected: row.expected,
    hasScreenshot: row.screenshot_key !== null,
    hasElementShot: row.element_shot_key !== null,
    context: parseContext(row.kind, row.context),
    element: parseElement(row.element),
    host: row.host,
    reply: row.kind !== "review" && row.user_id !== null,
    status: row.status,
    groupId: row.group_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at,
  };
}

export async function listFeedback(
  db: D1Database,
  input: FeedbackListInput,
): Promise<{
  rows: FeedbackRow[];
  cursor: string | null;
  groups: FeedbackGroup[];
  hosts: string[];
  newCount: number;
}> {
  const where = ["deleted_at IS NULL"];
  const binds: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    binds.push(value);
    where.push(clause.replace("?", `?${binds.length}`));
  };
  if (input.status) add("status = ?", input.status);
  if (input.kind) add("kind = ?", input.kind);
  if (input.product) add("product = ?", input.product);
  if (input.host) add("host = ?", input.host);
  if (input.groupId) add("group_id = ?", input.groupId);
  if (input.cursor) {
    const [at, id] = input.cursor.split("~");
    binds.push(at, id);
    const a = binds.length - 1;
    where.push(
      `(created_at < ?${a} OR (created_at = ?${a} AND id < ?${a + 1}))`,
    );
  }
  binds.push(input.limit + 1);
  const { results } = await db
    .prepare(
      `SELECT * FROM feedback WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, id DESC LIMIT ?${binds.length}`,
    )
    .bind(...binds)
    .all<FeedbackRow>();
  const rows = results.slice(0, input.limit);
  const last = rows.at(-1);
  const cursor =
    results.length > input.limit && last
      ? `${last.created_at}~${last.id}`
      : null;

  const groupIds = [
    ...new Set(rows.map((r) => r.group_id).filter((g) => g !== null)),
  ];
  const groups =
    groupIds.length === 0
      ? []
      : (
          await db
            .prepare(
              `SELECT id, summary, updated_at FROM feedback_groups
               WHERE id IN (${groupIds.map((_, i) => `?${i + 1}`).join(", ")})`,
            )
            .bind(...groupIds)
            .all<{ id: string; summary: string; updated_at: string }>()
        ).results.map((g) => ({
          id: g.id,
          summary: g.summary,
          updatedAt: g.updated_at,
        }));
  const [hosts, counted] = await db.batch<{ host?: string; n?: number }>([
    db.prepare(
      "SELECT DISTINCT host FROM feedback WHERE deleted_at IS NULL ORDER BY host",
    ),
    db.prepare(
      "SELECT COUNT(*) AS n FROM feedback WHERE status = 'new' AND deleted_at IS NULL",
    ),
  ]);
  return {
    rows,
    cursor,
    groups,
    hosts: (hosts?.results ?? []).flatMap((h) => (h.host ? [h.host] : [])),
    newCount: counted?.results[0]?.n ?? 0,
  };
}

/** Sets status, note or group. Closing stamps `closed_at`; reopening clears it. */
export async function updateFeedback(
  db: D1Database,
  id: string,
  change: {
    status?: FeedbackStatus;
    note?: string | null;
    groupId?: string | null;
  },
  now: Date,
): Promise<FeedbackRow | null> {
  const row = await getFeedback(db, id);
  if (!row) return null;
  const at = now.toISOString();
  const status = change.status ?? row.status;
  const closing = CLOSED_FEEDBACK_STATUSES.includes(status);
  const closedAt = !closing
    ? null
    : status === row.status
      ? (row.closed_at ?? at)
      : at;
  const note = change.note === undefined ? row.note : change.note || null;
  const groupId = change.groupId === undefined ? row.group_id : change.groupId;
  await db
    .prepare(
      `UPDATE feedback SET status = ?2, note = ?3, group_id = ?4,
         closed_at = ?5, updated_at = ?6 WHERE id = ?1`,
    )
    .bind(id, status, note, groupId, closedAt, at)
    .run();
  return {
    ...row,
    status,
    note,
    group_id: groupId,
    closed_at: closedAt,
    updated_at: at,
  };
}

export async function markReplied(
  db: D1Database,
  id: string,
  now: Date,
): Promise<void> {
  await db
    .prepare("UPDATE feedback SET replied_at = ?2 WHERE id = ?1")
    .bind(id, now.toISOString())
    .run();
}

/** The address a reply goes to: the person's, while their account lasts. */
export async function replyAddress(
  db: D1Database,
  userId: string,
): Promise<string | null> {
  return db
    .prepare("SELECT email FROM users WHERE id = ?1 AND status = 'active'")
    .bind(userId)
    .first<string>("email");
}

/**
 * Soft-deletes (or restores, within FEEDBACK_DELETE_UNDO_MS) an item. The
 * daily job, and the next delete, remove it for good.
 */
export async function setDeleted(
  db: D1Database,
  id: string,
  deleted: boolean,
  now: Date,
): Promise<"deleted" | "restored" | "gone"> {
  const row = await getAnyFeedback(db, id);
  if (!row) return "gone";
  if (deleted) {
    if (row.deleted_at === null)
      await db
        .prepare("UPDATE feedback SET deleted_at = ?2 WHERE id = ?1")
        .bind(id, now.toISOString())
        .run();
    return "deleted";
  }
  if (row.deleted_at === null) return "restored";
  if (row.deleted_at < retentionCutoffs(now).deletedBefore) return "gone";
  await db
    .prepare("UPDATE feedback SET deleted_at = NULL WHERE id = ?1")
    .bind(id)
    .run();
  return "restored";
}

/** Pinned notes on one route, oldest first, spam left out. */
export async function pinsOn(
  db: D1Database,
  pathname: string,
): Promise<FeedbackRow[]> {
  // The path is stored with its search params: match the pathname exactly,
  // or followed by `?`. LIKE's own wildcards in the path are escaped.
  const escaped = pathname.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { results } = await db
    .prepare(
      `SELECT * FROM feedback
       WHERE kind = 'review' AND deleted_at IS NULL AND status != 'spam'
         AND (path = ?1 OR path LIKE ?2 ESCAPE '\\')
       ORDER BY created_at, id LIMIT 200`,
    )
    .bind(pathname, `${escaped}?%`)
    .all<FeedbackRow>();
  return results;
}

/** How many rows a pruning pass looks at, at most. */
const PRUNE_BATCH = 500;

/**
 * The daily job's feedback pass (docs/FEEDBACK.md, "Retention"): undo
 * tokens cleared after 10 minutes; screenshots deleted 180 days after
 * sending or 30 after closing; items deleted a year on, or 10 seconds after
 * the owner deleted them. Images go before their rows, so an R2 failure
 * leaves the row to try again tomorrow.
 */
export async function pruneFeedback(
  db: D1Database,
  bucket: R2Bucket | undefined,
  now: Date,
): Promise<{ undoCleared: number; shotsExpired: number; removed: number }> {
  const cut = retentionCutoffs(now);
  const undo = await db
    .prepare(
      "UPDATE feedback SET undo_hash = NULL WHERE undo_hash IS NOT NULL AND created_at < ?1",
    )
    .bind(cut.undoCreatedBefore)
    .run();

  const { results: expiring } = await db
    .prepare(
      `SELECT id, screenshot_key, element_shot_key FROM feedback
       WHERE (screenshot_key IS NOT NULL OR element_shot_key IS NOT NULL)
         AND (created_at < ?1 OR (closed_at IS NOT NULL AND closed_at < ?2))
       LIMIT ${PRUNE_BATCH}`,
    )
    .bind(cut.shotsCreatedBefore, cut.shotsClosedBefore)
    .all<Pick<FeedbackRow, "id" | "screenshot_key" | "element_shot_key">>();
  const expiringKeys = expiring.flatMap(imageKeys);
  if (bucket && expiringKeys.length > 0) await bucket.delete(expiringKeys);
  if (expiring.length > 0)
    await db.batch(
      expiring.map((r) =>
        db
          .prepare(
            "UPDATE feedback SET screenshot_key = NULL, element_shot_key = NULL WHERE id = ?1",
          )
          .bind(r.id),
      ),
    );

  const { results: gone } = await db
    .prepare(
      `SELECT id, screenshot_key, element_shot_key FROM feedback
       WHERE created_at < ?1 OR (deleted_at IS NOT NULL AND deleted_at < ?2)
       LIMIT ${PRUNE_BATCH}`,
    )
    .bind(cut.rowsCreatedBefore, cut.deletedBefore)
    .all<Pick<FeedbackRow, "id" | "screenshot_key" | "element_shot_key">>();
  const goneKeys = gone.flatMap(imageKeys);
  if (bucket && goneKeys.length > 0) await bucket.delete(goneKeys);
  if (gone.length > 0)
    await db.batch(
      gone.map((r) =>
        db.prepare("DELETE FROM feedback WHERE id = ?1").bind(r.id),
      ),
    );
  // Groups nothing has pointed at for a day (a new group gets its items
  // right after it's made).
  await db
    .prepare(
      `DELETE FROM feedback_groups WHERE updated_at < ?1
         AND id NOT IN (SELECT group_id FROM feedback WHERE group_id IS NOT NULL)`,
    )
    .bind(new Date(now.getTime() - 86_400_000).toISOString())
    .run();

  return {
    undoCleared: undo.meta.changes ?? 0,
    shotsExpired: expiring.length,
    removed: gone.length,
  };
}

/**
 * Items the owner deleted more than FEEDBACK_DELETE_UNDO_MS ago, removed
 * for good with their images. Run on each delete, and by the daily job.
 */
export async function purgeDeleted(
  db: D1Database,
  bucket: R2Bucket | undefined,
  now: Date,
): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id, screenshot_key, element_shot_key FROM feedback
       WHERE deleted_at IS NOT NULL AND deleted_at < ?1 LIMIT 50`,
    )
    .bind(retentionCutoffs(now).deletedBefore)
    .all<Pick<FeedbackRow, "id" | "screenshot_key" | "element_shot_key">>();
  const keys = results.flatMap(imageKeys);
  if (bucket && keys.length > 0) await bucket.delete(keys);
  if (results.length > 0)
    await db.batch(
      results.map((r) =>
        db.prepare("DELETE FROM feedback WHERE id = ?1").bind(r.id),
      ),
    );
}
