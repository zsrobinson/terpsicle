// Plan sync's D1 side (docs/V2.md §5.2, migrations/0005_sync.sql). D1 has no
// interactive transactions, but a batch runs as one: each push is a single
// batch, so its reads, head bumps and writes can't interleave with another
// push, and of two pushes on the same base rev exactly one wins.
import { z } from "zod";
import {
  RevSchema,
  SYNC_MAX_PLANS,
  SYNC_PULL_PAGE,
  SYNC_TOMBSTONE_DAYS,
  type SyncDocRow,
  SyncDocRowSchema,
  type SyncPullResult,
  type SyncPushDoc,
  type SyncPushDocResult,
  syncDocFromRow,
} from "~/core/schema";

const DAY_MS = 86_400_000;

const SavedSchema = z.object({ rev: RevSchema.min(1) });
const HeadSchema = z.object({ head: RevSchema, pruned_through: RevSchema });

const DOC_COLUMNS = "kind, doc_id, rev, deleted, body, updated_at";

/**
 * Whether a doc may be saved: its stored rev (0 when there's no row) is the
 * push's base, and it wouldn't be a new live plan past SYNC_MAX_PLANS.
 * Params: ?1 user, ?2 kind, ?3 doc id, ?4 base rev, ?5 deleted, ?6 the cap.
 */
const MAY_SAVE = `
  COALESCE(
    (SELECT rev FROM sync_docs WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3),
    0
  ) = ?4
  AND (
    ?5 = 1 OR ?2 <> 'plan'
    OR EXISTS (
      SELECT 1 FROM sync_docs
      WHERE user_id = ?1 AND kind = 'plan' AND doc_id = ?3 AND deleted = 0
    )
    OR (
      SELECT COUNT(*) FROM sync_docs
      WHERE user_id = ?1 AND kind = 'plan' AND deleted = 0
    ) < ?6
  )`;

/** Takes the next rev, only if the doc may be saved. */
const BUMP_HEAD = `UPDATE sync_heads SET head = head + 1
  WHERE user_id = ?1 AND ${MAY_SAVE}`;

/**
 * Saves the doc at the rev BUMP_HEAD just took, under the same condition
 * (nothing in between changed it). ?7 term, ?8 body JSON, ?9 server time.
 * A tombstone keeps its plan's term.
 */
const SAVE_DOC = `INSERT INTO sync_docs
    (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
  SELECT ?1, ?2, ?3, ?7, head, ?5, ?8, ?9 FROM sync_heads
  WHERE user_id = ?1 AND ${MAY_SAVE}
  ON CONFLICT (user_id, kind, doc_id) DO UPDATE SET
    term_id = COALESCE(excluded.term_id, sync_docs.term_id),
    rev = excluded.rev,
    deleted = excluded.deleted,
    body = excluded.body,
    updated_at = excluded.updated_at
  RETURNING rev`;

/**
 * Saves each doc whose stored rev is its `baseRev`. Docs are independent: a
 * conflict on one doesn't stop the others. Results are in the push's order.
 */
export async function pushDocs(
  db: D1Database,
  userId: string,
  docs: readonly SyncPushDoc[],
  now: Date,
): Promise<SyncPushDocResult[]> {
  const at = now.toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO sync_heads (user_id) VALUES (?1) ON CONFLICT DO NOTHING",
      )
      .bind(userId),
  ];
  for (const doc of docs) {
    const deleted = doc.body === null ? 1 : 0;
    const cas = [
      userId,
      doc.kind,
      doc.id,
      doc.baseRev,
      deleted,
      SYNC_MAX_PLANS,
    ];
    const termId = doc.kind === "plan" && doc.body ? doc.body.termId : null;
    const body = doc.body === null ? null : JSON.stringify(doc.body);
    statements.push(
      // What was stored when the decision was made, for a conflict's answer.
      db
        .prepare(
          `SELECT ${DOC_COLUMNS} FROM sync_docs WHERE user_id = ?1 AND kind = ?2 AND doc_id = ?3`,
        )
        .bind(userId, doc.kind, doc.id),
      db.prepare(BUMP_HEAD).bind(...cas),
      db.prepare(SAVE_DOC).bind(...cas, termId, body, at),
    );
  }
  const results = await db.batch(statements);
  return docs.map((doc, i): SyncPushDocResult => {
    const ref = { kind: doc.kind, id: doc.id };
    const before = results[1 + i * 3]?.results[0];
    const saved = results[3 + i * 3]?.results[0];
    if (saved)
      return { ...ref, status: "ok", rev: SavedSchema.parse(saved).rev };
    const stored = before ? SyncDocRowSchema.parse(before) : null;
    if ((stored?.rev ?? 0) !== doc.baseRev)
      return {
        ...ref,
        status: "conflict",
        doc: stored ? syncDocFromRow(stored) : null,
      };
    // The base matched, so only the plan cap can have stopped it.
    return { ...ref, status: "too-many-plans" };
  });
}

/**
 * One page of docs saved after `since`, in rev order, or `reset` when the
 * cursor can't be continued: tombstones past it were pruned, or it's ahead
 * of the account's head (the account was deleted and made again).
 */
export async function pullDocs(
  db: D1Database,
  userId: string,
  since: number,
): Promise<SyncPullResult> {
  // One batch, so the head and the page are read at the same moment.
  const [heads, page] = await db.batch([
    db
      .prepare("SELECT head, pruned_through FROM sync_heads WHERE user_id = ?1")
      .bind(userId),
    db
      .prepare(
        `SELECT ${DOC_COLUMNS} FROM sync_docs WHERE user_id = ?1 AND rev > ?2
         ORDER BY rev LIMIT ?3`,
      )
      .bind(userId, since, SYNC_PULL_PAGE + 1),
  ]);
  const head = HeadSchema.parse(
    heads?.results[0] ?? { head: 0, pruned_through: 0 },
  );
  if (since > head.head) return { status: "reset" };
  // A device at 0 is pulling everything anyway: nothing it knew is missing.
  if (since > 0 && since < head.pruned_through) return { status: "reset" };
  const rows: SyncDocRow[] = (page?.results ?? []).map((r) =>
    SyncDocRowSchema.parse(r),
  );
  const docs = rows.slice(0, SYNC_PULL_PAGE).map(syncDocFromRow);
  return {
    status: "ok",
    cursor: docs.at(-1)?.rev ?? since,
    docs,
    more: rows.length > SYNC_PULL_PAGE,
  };
}

/**
 * Deletes tombstones saved more than SYNC_TOMBSTONE_DAYS ago, first raising
 * each affected user's `pruned_through`, so a device whose cursor is older
 * is told to pull everything again. Returns how many went.
 */
export async function pruneTombstones(
  db: D1Database,
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - SYNC_TOMBSTONE_DAYS * DAY_MS,
  ).toISOString();
  // One batch: a pull never sees the rows gone but the mark not raised.
  const [, pruned] = await db.batch([
    db
      .prepare(
        `UPDATE sync_heads SET pruned_through = MAX(
           pruned_through,
           (SELECT MAX(rev) FROM sync_docs d
            WHERE d.user_id = sync_heads.user_id
              AND d.deleted = 1 AND d.updated_at < ?1)
         )
         WHERE user_id IN (
           SELECT user_id FROM sync_docs WHERE deleted = 1 AND updated_at < ?1
         )`,
      )
      .bind(cutoff),
    db
      .prepare("DELETE FROM sync_docs WHERE deleted = 1 AND updated_at < ?1")
      .bind(cutoff),
  ]);
  return pruned?.meta.changes ?? 0;
}
