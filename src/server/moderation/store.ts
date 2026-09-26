// D1 access for moderation (migrations/0004_moderation.sql, V2 §9.4). Every
// row read is validated (CLAUDE.md: validate every boundary). SQL lives here
// and nowhere else. No author identity is ever written: only a surface and
// a ref.
import {
  type AdminReason,
  type DecidedBy,
  type DecisionStage,
  type GuardAnswer,
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
  type QueueSnapshot,
  type QueueStatus,
  type StoredVerdict,
} from "~/core/schema";
import { randomToken } from "../crypto";

/** Closed items keep their text this long, for undo and context (V2 §9.4). */
export const SNAPSHOT_DAYS = 30;

/** An automatic decision in V2's words: moderate() says remove, the log says reject. */
export function autoVerdict(decision: ModerationDecision): StoredVerdict {
  return decision === "publish"
    ? "allow"
    : decision === "hold"
      ? "hold"
      : "reject";
}

/** What a stored verdict means for the item now. */
export function decisionOf(verdict: StoredVerdict): ModerationDecision {
  switch (verdict) {
    case "allow":
    case "restore":
      return "publish";
    case "hold":
    case "hide":
      return "hold";
    case "reject":
    case "remove":
      return "remove";
  }
}

export interface NewDecision {
  surface: ModerationKind;
  ref: string;
  stage: DecisionStage;
  verdict: StoredVerdict;
  labels: readonly ModerationReason[];
  guard: GuardAnswer | null;
  policy: ModerationScores | null;
  models: ModerationModels | null;
  latencyMs: number | null;
  decidedBy: DecidedBy;
  reason: AdminReason | null;
  now: Date;
}

export function insertDecision(
  db: D1Database,
  d: NewDecision,
): D1PreparedStatement {
  const json = (v: unknown) => (v === null ? null : JSON.stringify(v));
  return db
    .prepare(
      `INSERT INTO moderation_decisions
         (id, surface, ref, stage, verdict, labels, guard, policy, models, latency_ms, decided_by, reason, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    )
    .bind(
      randomToken(16),
      d.surface,
      d.ref,
      d.stage,
      d.verdict,
      JSON.stringify(d.labels),
      json(d.guard),
      json(d.policy),
      json(d.models),
      d.latencyMs,
      d.decidedBy,
      d.reason,
      d.now.toISOString(),
    );
}

export interface NewQueueItem {
  surface: ModerationKind;
  ref: string;
  snapshot: QueueSnapshot;
  labels: readonly ModerationReason[];
  urgent: boolean;
  /** `retry` when only a failed check held it; `open` for the owner. */
  status: "retry" | "open";
  now: Date;
}

/**
 * Queues a held item. A ref already waiting (an edit, or a retry that held
 * again) is updated in place, so its id and place in line stay the same.
 */
export function upsertQueueItem(
  db: D1Database,
  item: NewQueueItem,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO moderation_queue (id, surface, ref, snapshot, labels, urgent, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (surface, ref) WHERE status IN ('retry', 'open') DO UPDATE SET
         snapshot = excluded.snapshot, labels = excluded.labels,
         urgent = excluded.urgent, status = excluded.status`,
    )
    .bind(
      randomToken(16),
      item.surface,
      item.ref,
      JSON.stringify(item.snapshot),
      JSON.stringify(item.labels),
      item.urgent ? 1 : 0,
      item.status,
      item.now.toISOString(),
    );
}

/** A newer automatic decision supersedes a waiting hold (an edit that now passes). */
export function dropWaitingQueueItem(
  db: D1Database,
  surface: ModerationKind,
  ref: string,
): D1PreparedStatement {
  return db
    .prepare(
      "DELETE FROM moderation_queue WHERE surface = ?1 AND ref = ?2 AND status IN ('retry', 'open')",
    )
    .bind(surface, ref);
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

/** Whether another row for the same item is waiting (retry or open). */
export async function hasWaitingRow(
  db: D1Database,
  row: ModerationQueueRow,
): Promise<boolean> {
  const found = await db
    .prepare(
      "SELECT 1 AS found FROM moderation_queue WHERE surface = ?1 AND ref = ?2 AND status IN ('retry', 'open') AND id <> ?3",
    )
    .bind(row.surface, row.ref, row.id)
    .first();
  return found !== null;
}

/** Retry rows, oldest first: what the cron screens again. */
export async function listRetryRows(
  db: D1Database,
  limit: number,
): Promise<ModerationQueueRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM moderation_queue WHERE status = 'retry' ORDER BY created_at ASC LIMIT ?1",
    )
    .bind(limit)
    .all();
  return results.map((r) => ModerationQueueRowSchema.parse(r));
}

export async function listQueueRows(
  db: D1Database,
  status: QueueStatus,
  limit: number,
): Promise<ModerationQueueRow[]> {
  // Open: urgent first, then oldest first (it's been waiting longest).
  // Closed: most recently closed first, for undo.
  const order =
    status === "open"
      ? "urgent DESC, created_at ASC"
      : "closed_at DESC, created_at DESC";
  const { results } = await db
    .prepare(
      `SELECT * FROM moderation_queue WHERE status = ?1 ORDER BY ${order} LIMIT ?2`,
    )
    .bind(status, limit)
    .all();
  return results.map((r) => ModerationQueueRowSchema.parse(r));
}

export async function countOpen(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_queue WHERE status = 'open'")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export function setQueueStatus(
  db: D1Database,
  id: string,
  status: "open" | "closed",
  closedAt: Date | null,
): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE moderation_queue SET status = ?2, closed_at = ?3 WHERE id = ?1",
    )
    .bind(id, status, closedAt?.toISOString() ?? null);
}

export function updateRetryRow(
  db: D1Database,
  id: string,
  update: {
    status: "retry" | "open";
    snapshot: QueueSnapshot;
    labels: readonly ModerationReason[];
    urgent: boolean;
  },
): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE moderation_queue SET status = ?2, snapshot = ?3, labels = ?4, urgent = ?5 WHERE id = ?1",
    )
    .bind(
      id,
      update.status,
      JSON.stringify(update.snapshot),
      JSON.stringify(update.labels),
      update.urgent ? 1 : 0,
    );
}

export function deleteQueueRow(
  db: D1Database,
  id: string,
): D1PreparedStatement {
  return db.prepare("DELETE FROM moderation_queue WHERE id = ?1").bind(id);
}

/** Blanks the text of items closed more than SNAPSHOT_DAYS ago; returns how many. */
export async function blankOldSnapshots(
  db: D1Database,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - SNAPSHOT_DAYS * 86_400_000);
  const result = await db
    .prepare(
      "UPDATE moderation_queue SET snapshot = NULL WHERE status = 'closed' AND closed_at < ?1 AND snapshot IS NOT NULL",
    )
    .bind(cutoff.toISOString())
    .run();
  return result.meta.changes ?? 0;
}

/** Every decision for one item, oldest first. */
export async function decisionsFor(
  db: D1Database,
  surface: ModerationKind,
  ref: string,
): Promise<ModerationDecisionRow[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM moderation_decisions WHERE surface = ?1 AND ref = ?2 ORDER BY created_at ASC, rowid ASC",
    )
    .bind(surface, ref)
    .all();
  return results.map((r) => ModerationDecisionRowSchema.parse(r));
}

/** The owner's latest decision for an item, if any. */
async function latestAdminDecision(
  db: D1Database,
  row: ModerationQueueRow,
): Promise<{ verdict: StoredVerdict; reason: AdminReason | null } | null> {
  const found = await db
    .prepare(
      `SELECT verdict, reason FROM moderation_decisions
       WHERE surface = ?1 AND ref = ?2 AND decided_by = 'admin'
       ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .bind(row.surface, row.ref)
    .first();
  if (!found) return null;
  return ModerationDecisionRowSchema.pick({
    verdict: true,
    reason: true,
  }).parse(found);
}

export async function toQueueItem(
  db: D1Database,
  row: ModerationQueueRow,
): Promise<QueueItem> {
  const admin =
    row.status === "closed" ? await latestAdminDecision(db, row) : null;
  const decision = admin ? decisionOf(admin.verdict) : null;
  return {
    id: row.id,
    kind: row.surface,
    targetId: row.ref,
    course: row.snapshot?.course ?? null,
    text: row.snapshot?.text ?? null,
    reasons: row.labels,
    scores: row.snapshot?.scores ?? {},
    urgent: row.urgent,
    // The API never lists retry rows; a stray one reads as open.
    status: row.status === "closed" ? "closed" : "open",
    createdAt: row.created_at,
    closedAt: row.closed_at,
    resolution:
      admin && decision && decision !== "hold"
        ? { decision, reason: admin.reason }
        : null,
  };
}
