// How a decision made later (by the owner, or by an automatic retry) reaches
// the feature that owns the item: Reviews publishes or hides the review,
// Chat delivers or deletes the message.
import type { ModerationReason } from "~/core/schema";
import type { CourseChatNamespace } from "../chat/course-chat";
import { chatModerationHandler } from "../chat/moderation-handler";

/**
 * Called with the item's new state. Must be idempotent: undo calls it again
 * with "hold", and a retry that fails partway runs it again next time.
 * `ctx.reasons`, when given, says why (v2/reviews-api passes them).
 */
export type ModerationHandler = (
  targetId: string,
  decision: "publish" | "hold" | "remove",
  ctx?: { reasons?: readonly ModerationReason[] },
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
 * The live handlers, for this Worker's bindings. Reviews adds its own here
 * when it lands; until then, features read an item's state with
 * currentDecision().
 */
export function moderationHandlers(
  env: ModerationHandlerEnv,
): ModerationHandlers {
  return env.COURSE_CHAT
    ? { chat: chatModerationHandler(env.COURSE_CHAT) }
    : {};
}
