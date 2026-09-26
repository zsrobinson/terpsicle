// How a decision made later (by the owner, or by an automatic retry) reaches
// the feature that owns the item: Reviews publishes or hides the review,
// Chat delivers or deletes the message.
import type { ModerationReason } from "~/core/schema";
import type { CourseChatNamespace } from "../chat/course-chat";
import { chatModerationHandler } from "../chat/moderation-handler";
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
 * with "hold", and a retry that fails partway runs it again next time.
 */
export type ModerationHandler = (
  targetId: string,
  decision: "publish" | "hold" | "remove",
  ctx: HandlerContext,
) => Promise<void>;

export type ModerationHandlers = Partial<
  Record<"review" | "chat", ModerationHandler>
>;

/** The bindings handlers reach their feature through. */
export interface ModerationHandlerEnv {
  /** Chat's objects; absent in harnesses that don't run Chat. */
  COURSE_CHAT?: CourseChatNamespace;
}

/**
 * The live handlers, for this Worker's bindings: Reviews' works on D1 alone,
 * Chat's reaches the message's CourseChat object through `COURSE_CHAT`.
 */
export function moderationHandlers(
  env: ModerationHandlerEnv,
): ModerationHandlers {
  return {
    review: applyReviewDecision,
    ...(env.COURSE_CHAT
      ? { chat: chatModerationHandler(env.COURSE_CHAT) }
      : {}),
  };
}
