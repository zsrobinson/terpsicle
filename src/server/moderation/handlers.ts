// How a decision made later (by the owner, or by an automatic retry) reaches
// the feature that owns the item: Reviews publishes or hides the review,
// Chat delivers or deletes the message.

/**
 * Called with the item's new state. Must be idempotent: undo calls it again
 * with "hold", and a retry that fails partway runs it again next time. An
 * unknown `targetId` is done, not an error: the author may have deleted the
 * post while it waited, and test copies queue made-up posts
 * (src/server/admin/samples.ts) that no feature stored.
 */
export type ModerationHandler = (
  targetId: string,
  decision: "publish" | "hold" | "remove",
) => Promise<void>;

export type ModerationHandlers = Partial<
  Record<"review" | "chat", ModerationHandler>
>;

/**
 * The live handlers. Reviews and Chat each add theirs here when they land;
 * until then, features read an item's state with currentDecision().
 */
export const MODERATION_HANDLERS: ModerationHandlers = {};
