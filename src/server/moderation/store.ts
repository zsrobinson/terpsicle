// D1 access for moderation (migrations/0004_moderation.sql, V2 §9.4). Every
// row read is validated (CLAUDE.md: validate every boundary). SQL lives here
// and nowhere else. No author identity is ever written: only a surface and
// a ref.

import { z } from "zod";
import type { ReportLike } from "~/core/moderation";
import {
  type AdminReason,
  type DecidedBy,
  type DecisionDay,
  DecisionDaySchema,
  type DecisionStage,
  type GuardAnswer,
  IsoDateTimeSchema,
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
  type ReportReason,
  ReportRowSchema,
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

/**
 * Puts an item in front of the owner: a new `open` row, or the waiting row
 * (open or retry) turned `open` with `labels` and at least `urgent`. A
 * waiting row keeps its snapshot, the text its hold was about.
 */
export function queueOpenItem(
  db: D1Database,
  item: Omit<NewQueueItem, "status">,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO moderation_queue (id, surface, ref, snapshot, labels, urgent, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)
       ON CONFLICT (surface, ref) WHERE status IN ('retry', 'open') DO UPDATE SET
         labels = excluded.labels, urgent = MAX(urgent, excluded.urgent), status = 'open'`,
    )
    .bind(
      randomToken(16),
      item.surface,
      item.ref,
      JSON.stringify(item.snapshot),
      JSON.stringify(item.labels),
      item.urgent ? 1 : 0,
      item.now.toISOString(),
    );
}

/** The item's waiting row (retry or open), if any. */
export async function getWaitingRow(
  db: D1Database,
  surface: ModerationKind,
  ref: string,
): Promise<ModerationQueueRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM moderation_queue WHERE surface = ?1 AND ref = ?2 AND status IN ('retry', 'open')",
    )
    .bind(surface, ref)
    .first();
  return row ? ModerationQueueRowSchema.parse(row) : null;
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

/** The item's waiting row (retry or open), if it has one. */
export async function waitingRowFor(
  db: D1Database,
  surface: ModerationKind,
  ref: string,
): Promise<ModerationQueueRow | null> {
  const row = await db
    .prepare(
      "SELECT * FROM moderation_queue WHERE surface = ?1 AND ref = ?2 AND status IN ('retry', 'open')",
    )
    .bind(surface, ref)
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

// ---------- reports (V2 §9.3) ----------

/** Records a report; false when this person had already reported the item. */
export async function insertReport(
  db: D1Database,
  r: {
    surface: ModerationKind;
    ref: string;
    reporterId: string;
    reason: ReportReason;
    note: string | null;
    now: Date;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO reports (surface, ref, reporter_id, reason, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING`,
    )
    .bind(r.surface, r.ref, r.reporterId, r.reason, r.note, r.now.toISOString())
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * The item's reports since the owner last approved it, oldest first: the
 * ones still waiting for a person. An approval settles earlier reports, so
 * they don't count toward hiding it again.
 */
export async function openReports(
  db: D1Database,
  surface: ModerationKind,
  ref: string,
): Promise<ReportLike[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM reports
       WHERE surface = ?1 AND ref = ?2 AND created_at > COALESCE((
         SELECT MAX(created_at) FROM moderation_decisions
         WHERE surface = ?1 AND ref = ?2 AND decided_by = 'admin' AND verdict = 'allow'), '')
       ORDER BY created_at ASC, rowid ASC`,
    )
    .bind(surface, ref)
    .all();
  return results.map((row) => {
    const r = ReportRowSchema.parse(row);
    return { reporterId: r.reporter_id, reason: r.reason };
  });
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

// ---------- The admin panel's reads (src/server/admin, V2 §10) ----------

export interface QueueStats {
  open: number;
  urgent: number;
  oldestOpenAt: string | null;
  retry: number;
  oldestRetryAt: string | null;
}

const QueueStatsRowSchema = z.object({
  status: z.enum(["retry", "open"]),
  n: z.number().int().min(0),
  urgent: z.number().int().min(0).nullable(),
  oldest: IsoDateTimeSchema.nullable(),
});

/** What's waiting, for the health header: one small grouped scan. */
export async function queueStats(db: D1Database): Promise<QueueStats> {
  const { results } = await db
    .prepare(
      `SELECT status, COUNT(*) AS n, SUM(urgent) AS urgent, MIN(created_at) AS oldest
       FROM moderation_queue WHERE status IN ('retry', 'open') GROUP BY status`,
    )
    .all();
  const rows = QueueStatsRowSchema.array().parse(results);
  const open = rows.find((r) => r.status === "open");
  const retry = rows.find((r) => r.status === "retry");
  return {
    open: open?.n ?? 0,
    urgent: open?.urgent ?? 0,
    oldestOpenAt: open?.oldest ?? null,
    retry: retry?.n ?? 0,
    oldestRetryAt: retry?.oldest ?? null,
  };
}

export interface DecisionFilters {
  surface?: ModerationKind | undefined;
  stage?: DecisionStage | undefined;
  verdict?: StoredVerdict | undefined;
}

/**
 * The decision log, newest first: `limit` rows after `after` (the last row
 * of the previous page). A missing filter matches everything.
 */
export async function listDecisionRows(
  db: D1Database,
  filters: DecisionFilters,
  after: { createdAt: string; id: string } | null,
  limit: number,
): Promise<ModerationDecisionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM moderation_decisions
       WHERE (?1 IS NULL OR surface = ?1)
         AND (?2 IS NULL OR stage = ?2)
         AND (?3 IS NULL OR verdict = ?3)
         AND (?4 IS NULL OR created_at < ?4 OR (created_at = ?4 AND id < ?5))
       ORDER BY created_at DESC, id DESC
       LIMIT ?6`,
    )
    .bind(
      filters.surface ?? null,
      filters.stage ?? null,
      filters.verdict ?? null,
      after?.createdAt ?? null,
      after?.id ?? null,
      limit,
    )
    .all();
  return results.map((r) => ModerationDecisionRowSchema.parse(r));
}

/**
 * Automatic decisions per UTC day since `since`: allowed, held and
 * rejected, for the held share. Days without any are left out.
 */
export async function decisionDayCounts(
  db: D1Database,
  surface: ModerationKind | undefined,
  since: Date,
): Promise<DecisionDay[]> {
  const { results } = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
         SUM(verdict = 'allow') AS allowed,
         SUM(verdict = 'hold') AS held,
         SUM(verdict = 'reject') AS rejected
       FROM moderation_decisions
       WHERE decided_by = 'system' AND created_at >= ?1
         AND (?2 IS NULL OR surface = ?2)
       GROUP BY day`,
    )
    .bind(since.toISOString(), surface ?? null)
    .all();
  return DecisionDaySchema.array().parse(results);
}
