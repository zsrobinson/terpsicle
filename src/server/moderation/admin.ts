// The owner's side of moderation: list held items, approve or remove them
// with a reason, and undo (DESIGN §5: undo instead of confirmation dialogs).
// Items carry no author, so the admin view can't show one.
import type {
  ModerationDecision,
  ModerationKind,
  QueueListInput,
  QueueListResult,
  ResolveInput,
  ResolveResult,
  UndoInput,
} from "~/core/schema";
import {
  countPending,
  getQueueRow,
  insertDecision,
  listQueueRows,
  setQueueStatus,
  toQueueItem,
} from "./store";

export interface AdminIdentity {
  /** The admin's directory ID, for logs. Never stored with a decision. */
  directoryId: string;
}

/**
 * Who may use /api/admin/*. Identity's `requireAdmin` (Google sign-in plus
 * the admin allowlist) plugs in here; until it lands, nobody may.
 */
export type AdminGuard = (
  request: Request,
  env: unknown,
) => Promise<AdminIdentity | null>;

export const denyAllAdmins: AdminGuard = async () => null;

/**
 * How a decision reaches the feature that owns the item: Reviews publishes
 * or hides the review, Chat delivers or deletes the message. Each feature
 * registers one when it lands. Handlers must be idempotent: undo calls them
 * again with "hold".
 */
export type ModerationHandler = (
  targetId: string,
  decision: ModerationDecision,
) => Promise<void>;
export type ModerationHandlers = Partial<
  Record<ModerationKind, ModerationHandler>
>;

export interface AdminDeps {
  now: Date;
  handlers: ModerationHandlers;
}

export async function listQueue(
  db: D1Database,
  input: QueueListInput,
): Promise<QueueListResult> {
  const [rows, pending] = await Promise.all([
    listQueueRows(db, input.status, input.limit),
    countPending(db),
  ]);
  return { items: rows.map(toQueueItem), pending };
}

export async function resolveQueueItem(
  db: D1Database,
  input: ResolveInput,
  deps: AdminDeps,
): Promise<ResolveResult> {
  const row = await getQueueRow(db, input.id);
  if (!row) return { status: "not-found" };
  const decision = input.action === "approve" ? "publish" : "remove";
  // The feature acts first: if it fails, nothing is recorded and the owner
  // can try again.
  await deps.handlers[row.kind]?.(row.target_id, decision);
  await db.batch([
    setQueueStatus(
      db,
      row.id,
      input.action === "approve" ? "approved" : "removed",
      { at: deps.now, reason: input.reason, note: input.note ?? null },
    ),
    insertDecision(db, {
      kind: row.kind,
      targetId: row.target_id,
      decision,
      actor: "admin",
      reasons:
        decision === "remove"
          ? [
              {
                code: "admin",
                source: "admin",
                action: "remove",
                adminReason: input.reason,
              },
            ]
          : [],
      models: { guard: null, policy: null },
      scores: {},
      now: deps.now,
    }),
  ]);
  const updated = await getQueueRow(db, row.id);
  // The row was just read and only updated since; it can't be gone.
  return updated
    ? { status: "ok", item: toQueueItem(updated) }
    : { status: "not-found" };
}

/** Puts a resolved item back in the queue, held, as it was before. */
export async function undoQueueItem(
  db: D1Database,
  input: UndoInput,
  deps: AdminDeps,
): Promise<ResolveResult> {
  const row = await getQueueRow(db, input.id);
  if (!row) return { status: "not-found" };
  if (row.status === "pending") return { status: "nothing-to-undo" };
  await deps.handlers[row.kind]?.(row.target_id, "hold");
  await db.batch([
    setQueueStatus(db, row.id, "pending", null),
    insertDecision(db, {
      kind: row.kind,
      targetId: row.target_id,
      decision: "hold",
      actor: "admin",
      reasons: [{ code: "undo", source: "admin", action: "hold" }],
      models: { guard: null, policy: null },
      scores: {},
      now: deps.now,
    }),
  ]);
  const updated = await getQueueRow(db, row.id);
  return updated
    ? { status: "ok", item: toQueueItem(updated) }
    : { status: "not-found" };
}
