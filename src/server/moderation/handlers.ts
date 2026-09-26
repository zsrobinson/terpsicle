// How a decision made later (by the owner, or by an automatic retry) reaches
// the feature that owns the item: Reviews publishes or hides the review,
// Chat delivers or deletes the message.
import type { ModerationReason } from "~/core/schema";
import { applyReviewDecision } from "../reviews/decisions";

export interface HandlerContext {
  db: D1Database;
  now: Date;
  /**
   * Why: the retry's reasons, or the owner's (`admin` with their reason on
   * a removal, `undo` on an undo). Empty for an approval.
   */
  reasons: readonly ModerationReason[];
}

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
  ctx: HandlerContext,
) => Promise<void>;

export type ModerationHandlers = Partial<
  Record<"review" | "chat", ModerationHandler>
>;

/** The live handlers. Chat adds its own when it lands. */
export const MODERATION_HANDLERS: ModerationHandlers = {
  review: applyReviewDecision,
};
