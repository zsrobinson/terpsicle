// The owner's side of moderation: list held items, approve or remove them
// with a reason, and undo (DESIGN §5: undo instead of confirmation dialogs).
// Items carry no author, so the admin view can't show one. The routes are
// `auth: "admin"` in src/server/api/router.ts (identity's session check).
import type {
  QueueListInput,
  QueueListResult,
  ResolveInput,
  ResolveResult,
  UndoInput,
} from "~/core/schema";
import type { ModerationHandlers } from "./handlers";
import {
  countOpen,
  getQueueRow,
  hasWaitingRow,
  insertDecision,
  listQueueRows,
  setQueueStatus,
  toQueueItem,
} from "./store";

export type { ModerationHandler, ModerationHandlers } from "./handlers";

export interface AdminDeps {
  now: Date;
  handlers: ModerationHandlers;
}

export async function listQueue(
  db: D1Database,
  input: QueueListInput,
): Promise<QueueListResult> {
  const [rows, open] = await Promise.all([
    listQueueRows(db, input.status, input.limit),
    countOpen(db),
  ]);
  return {
    items: await Promise.all(rows.map((r) => toQueueItem(db, r))),
    open,
  };
}

export async function resolveQueueItem(
  db: D1Database,
  input: ResolveInput,
  deps: AdminDeps,
): Promise<ResolveResult> {
  const row = await getQueueRow(db, input.id);
  if (!row || row.status === "retry") return { status: "not-found" };
  const decision = input.action === "approve" ? "publish" : "remove";
  // The feature acts first: if it fails, nothing is recorded and the owner
  // can try again.
  await deps.handlers[row.surface]?.(row.ref, decision);
  await db.batch([
    setQueueStatus(db, row.id, "closed", deps.now),
    insertDecision(db, {
      surface: row.surface,
      ref: row.ref,
      stage: "human",
      verdict: decision === "publish" ? "allow" : "remove",
      labels: [],
      guard: null,
      policy: null,
      models: null,
      latencyMs: null,
      decidedBy: "admin",
      reason: input.reason,
      now: deps.now,
    }),
  ]);
  return ok(db, row.id);
}

/** Puts a closed item back in the queue, held, as it was before. */
export async function undoQueueItem(
  db: D1Database,
  input: UndoInput,
  deps: AdminDeps,
): Promise<ResolveResult> {
  const row = await getQueueRow(db, input.id);
  if (!row || row.status === "retry") return { status: "not-found" };
  // Still open, or the item was held again since (an edit): nothing to put back.
  if (row.status !== "closed" || (await hasWaitingRow(db, row)))
    return { status: "nothing-to-undo" };
  await deps.handlers[row.surface]?.(row.ref, "hold");
  await db.batch([
    setQueueStatus(db, row.id, "open", null),
    insertDecision(db, {
      surface: row.surface,
      ref: row.ref,
      stage: "human",
      verdict: "hold",
      labels: [{ code: "undo", source: "admin", action: "hold" }],
      guard: null,
      policy: null,
      models: null,
      latencyMs: null,
      decidedBy: "admin",
      reason: null,
      now: deps.now,
    }),
  ]);
  return ok(db, row.id);
}

async function ok(db: D1Database, id: string): Promise<ResolveResult> {
  const updated = await getQueueRow(db, id);
  // The row was just read and only updated since; it can't be gone.
  return updated
    ? { status: "ok", item: await toQueueItem(db, updated) }
    : { status: "not-found" };
}
