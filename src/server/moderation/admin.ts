// The owner's side of moderation: list held items, approve or remove them
// with a reason (and maybe stop their author), and undo (DESIGN §5: undo
// instead of confirmation dialogs).
// Items carry no author, so the admin view can't show one. The routes are
// `auth: "admin"` in src/server/api/router.ts (identity's session check).
import { authorStopUntil } from "~/core/moderation";
import type {
  ModerationReason,
  QueueItem,
  QueueListInput,
  QueueListResult,
  ResolveInput,
  ResolveResult,
  UndoInput,
} from "~/core/schema";
import { reviewQueueContexts } from "../reviews/store";
import type { AuthorActors, ModerationHandlers } from "./handlers";
import {
  activeAuthorStop,
  countOpen,
  getQueueRow,
  hasWaitingRow,
  insertAuthorStop,
  insertDecision,
  listQueueRows,
  markAuthorStopUndone,
  setQueueStatus,
  toQueueItem,
} from "./store";

export type { ModerationHandler, ModerationHandlers } from "./handlers";

export interface AdminDeps {
  now: Date;
  handlers: ModerationHandlers;
  /** How "stop this author" reaches Reviews and Chat. */
  actors: AuthorActors;
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
    items: await withContext(
      db,
      await Promise.all(rows.map((r) => toQueueItem(db, r))),
    ),
    open,
  };
}

/** Adds what Reviews knows about held reviews: instructor, rating, term, grade. */
async function withContext(
  db: D1Database,
  items: QueueItem[],
): Promise<QueueItem[]> {
  const contexts = await reviewQueueContexts(
    db,
    items.filter((i) => i.kind === "review").map((i) => i.targetId),
  );
  return items.map((item) =>
    item.kind === "review"
      ? { ...item, review: contexts.get(item.targetId) ?? null }
      : item,
  );
}

const STOPPED: ModerationReason = {
  code: "author-stopped",
  source: "admin",
  action: "remove",
};

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
  await deps.handlers[row.surface]?.(row.ref, decision, {
    db,
    now: deps.now,
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
  });
  // Then the author, if asked: only the feature knows who, and it answers
  // only when the stop ends. Nobody to stop (a purged account, a sample):
  // the removal stands on its own.
  const actor = deps.actors[row.surface];
  const stop =
    input.authorAction === "stop" && decision === "remove" && actor
      ? await actor.stop(row.ref, authorStopUntil(row.surface, deps.now), {
          db,
        })
      : null;
  await db.batch([
    setQueueStatus(db, row.id, "closed", deps.now),
    ...(stop ? [insertAuthorStop(db, row.id, stop, deps.now)] : []),
    insertDecision(db, {
      surface: row.surface,
      ref: row.ref,
      stage: "human",
      verdict: decision === "publish" ? "allow" : "remove",
      labels: stop ? [STOPPED] : [],
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
  const undo = { code: "undo", source: "admin", action: "hold" } as const;
  await deps.handlers[row.surface]?.(row.ref, "hold", {
    db,
    now: deps.now,
    reasons: [undo],
  });
  // The author's stop goes with the decision it came with.
  const stop = await activeAuthorStop(db, row.id);
  if (stop) await deps.actors[row.surface]?.restore(row.ref, stop, { db });
  await db.batch([
    setQueueStatus(db, row.id, "open", null),
    ...(stop ? [markAuthorStopUndone(db, stop.id, deps.now)] : []),
    insertDecision(db, {
      surface: row.surface,
      ref: row.ref,
      stage: "human",
      verdict: "hold",
      labels: [undo],
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
  // The row was just read and only updated since, so it's there.
  const updated = await getQueueRow(db, id);
  if (!updated) return { status: "not-found" };
  const [item] = await withContext(db, [await toQueueItem(db, updated)]);
  return item ? { status: "ok", item } : { status: "not-found" };
}
