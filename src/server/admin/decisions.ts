// POST /api/admin/decisions (V2 §10): the decision log, filterable by
// surface, stage and verdict, a page at a time, with each day's automatic
// decisions for the held share. Rows are text-free and author-free.
import {
  DECISION_DAYS,
  decisionCursor,
  fillDays,
  parseDecisionCursor,
} from "~/core/moderation/admin";
import type { ModerationDecisionRow } from "~/core/schema";
import type {
  DecisionEntry,
  DecisionListInput,
  DecisionListResult,
} from "~/core/schema/admin";
import { decisionDayCounts, listDecisionRows } from "../moderation/store";

const DAY_MS = 86_400_000;

export async function listDecisions(
  db: D1Database,
  input: DecisionListInput,
  now: Date,
): Promise<DecisionListResult> {
  const filters = {
    surface: input.surface,
    stage: input.stage,
    verdict: input.verdict,
  };
  // Midnight UTC, DECISION_DAYS − 1 days ago: the oldest day shown.
  const since = new Date(
    Math.floor(now.getTime() / DAY_MS) * DAY_MS - (DECISION_DAYS - 1) * DAY_MS,
  );
  const [rows, counts] = await Promise.all([
    listDecisionRows(
      db,
      filters,
      input.cursor ? parseDecisionCursor(input.cursor) : null,
      // One extra row says whether there's another page.
      input.limit + 1,
    ),
    decisionDayCounts(db, input.surface, since),
  ]);
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return {
    decisions: page.map(toEntry),
    cursor:
      rows.length > input.limit && last
        ? decisionCursor({ createdAt: last.created_at, id: last.id })
        : null,
    days: fillDays(counts, now),
  };
}

// Model ids and raw answers stay out: the log says what was decided and why.
function toEntry(row: ModerationDecisionRow): DecisionEntry {
  return {
    id: row.id,
    kind: row.surface,
    targetId: row.ref,
    stage: row.stage,
    verdict: row.verdict,
    decidedBy: row.decided_by,
    reasons: row.labels,
    reason: row.reason,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}
