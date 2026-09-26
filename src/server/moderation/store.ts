// D1 access for moderation. Every row read is validated (CLAUDE.md: validate
// every boundary). SQL lives here and nowhere else. No author identity is
// ever written: only the kind and the target id the caller gave.
import {
  type AdminReason,
  type ModerationActor,
  type ModerationDecision,
  type ModerationDecisionRow,
  ModerationDecisionRowSchema,
  type ModerationKind,
  type ModerationModels,
  type ModerationQueueRow,
  ModerationQueueRowSchema,
  type ModerationReason,
  type ModerationScores,
  type QueueItem,
  type QueueStatus,
} from "~/core/schema";
import { randomToken } from "../crypto";

export interface NewDecision {
  kind: ModerationKind;
  targetId: string;
  decision: ModerationDecision;
  actor: ModerationActor;
  reasons: readonly ModerationReason[];
  models: ModerationModels;
  scores: ModerationScores;
  now: Date;
}

export function insertDecision(
  db: D1Database,
  d: NewDecision,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO moderation_decisions (id, kind, target_id, decision, actor, reasons, models, scores, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      randomToken(16),
      d.kind,
      d.targetId,
      d.decision,
      d.actor,
      JSON.stringify(d.reasons),
      JSON.stringify(d.models),
      JSON.stringify(d.scores),
      d.now.toISOString(),
    );
}

export interface NewQueueItem {
  kind: ModerationKind;
  targetId: string;
  course: string | null;
  text: string;
  reasons: readonly ModerationReason[];
  scores: ModerationScores;
  urgent: boolean;
  now: Date;
}

/** Queues a held item, or puts an existing one back to pending with the new text. */
export function upsertQueueItem(
  db: D1Database,
  item: NewQueueItem,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO moderation_queue (id, kind, target_id, course, text, reasons, scores, urgent, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)
       ON CONFLICT (kind, target_id) DO UPDATE SET
         course = excluded.course, text = excluded.text, reasons = excluded.reasons,
         scores = excluded.scores, urgent = excluded.urgent, status = 'pending',
         created_at = excluded.created_at, resolved_at = NULL,
         resolution_reason = NULL, resolution_note = NULL`,
    )
    .bind(
      randomToken(16),
      item.kind,
      item.targetId,
      item.course,
      item.text,
      JSON.stringify(item.reasons),
      JSON.stringify(item.scores),
      item.urgent ? 1 : 0,
      item.now.toISOString(),
    );
}

/** A newer automatic decision supersedes a pending hold (an edit that now passes). */
export function dropPendingQueueItem(
  db: D1Database,
  kind: ModerationKind,
  targetId: string,
): D1PreparedStatement {
  return db
    .prepare(
      "DELETE FROM moderation_queue WHERE kind = ?1 AND target_id = ?2 AND status = 'pending'",
    )
    .bind(kind, targetId);
}

export async function getQueueRow(
  db: D1Database,
  id: string,
): Promise<ModerationQueueRow | null> {
  const row = await db
    .prepare("SELECT * FROM moderation_queue WHERE id = ?1")
    .bind(id)
    .first();
  return row ? ModerationQueueRowSchema.parse(row) : null;
}

export async function listQueueRows(
  db: D1Database,
  status: QueueStatus,
  limit: number,
): Promise<ModerationQueueRow[]> {
  // Pending: urgent first, then oldest first (it's been waiting longest).
  // Resolved: most recently resolved first, for undo.
  const order =
    status === "pending"
      ? "urgent DESC, created_at ASC"
      : "resolved_at DESC, created_at DESC";
  const { results } = await db
    .prepare(
      `SELECT * FROM moderation_queue WHERE status = ?1 ORDER BY ${order} LIMIT ?2`,
    )
    .bind(status, limit)
    .all();
  return results.map((r) => ModerationQueueRowSchema.parse(r));
}

export async function countPending(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM moderation_queue WHERE status = 'pending'",
    )
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export function setQueueStatus(
  db: D1Database,
  id: string,
  status: QueueStatus,
  resolution: {
    at: Date;
    reason: AdminReason;
    note: string | null;
  } | null,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE moderation_queue SET status = ?2, resolved_at = ?3, resolution_reason = ?4, resolution_note = ?5
       WHERE id = ?1`,
    )
    .bind(
      id,
      status,
      resolution?.at.toISOString() ?? null,
      resolution?.reason ?? null,
      resolution?.note ?? null,
    );
}

/** Every decision for one item, oldest first. */
export async function decisionsFor(
  db: D1Database,
  kind: ModerationKind,
  targetId: string,
): Promise<ModerationDecisionRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM moderation_decisions WHERE kind = ?1 AND target_id = ?2 ORDER BY created_at ASC, rowid ASC",
    )
    .bind(kind, targetId)
    .all();
  return results.map((r) => ModerationDecisionRowSchema.parse(r));
}

export function toQueueItem(row: ModerationQueueRow): QueueItem {
  return {
    id: row.id,
    kind: row.kind,
    targetId: row.target_id,
    course: row.course,
    text: row.text,
    reasons: row.reasons,
    scores: row.scores,
    urgent: row.urgent,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolutionReason: row.resolution_reason,
    resolutionNote: row.resolution_note,
  };
}
