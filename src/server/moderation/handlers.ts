// How a decision made later (by the owner, or by an automatic retry) reaches
// the feature that owns the item: Reviews publishes or hides the review,
// Chat delivers or deletes the message.
import type { ModerationReason } from "~/core/schema";
import type { CourseChatNamespace } from "../chat/course-chat";
import {
  chatAuthorActor,
  chatModerationHandler,
} from "../chat/moderation-handler";
import { applyReviewDecision, reviewAuthorActor } from "../reviews/decisions";

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

/**
 * The owner's "stop this author" (V2 §7.5, §10), through an item: only the
 * feature knows who wrote it, so it applies the stop and answers when it
 * ends and what it replaced (for undo), never who. `stop` answers null when
 * there's nobody to stop (a purged account, a deleted post, a test sample).
 */
export interface AuthorActor {
  stop(
    targetId: string,
    until: string,
    ctx: { db: D1Database },
  ): Promise<{ until: string; previous: string | null } | null>;
  /** Puts back what was there, unless the stop changed since. Idempotent. */
  restore(
    targetId: string,
    stop: { until: string; previous: string | null },
    ctx: { db: D1Database },
  ): Promise<void>;
}

export type AuthorActors = Partial<Record<"review" | "chat", AuthorActor>>;

/** The live actors, for this Worker's bindings (like moderationHandlers). */
export function authorActors(env: ModerationHandlerEnv): AuthorActors {
  return {
    review: reviewAuthorActor,
    ...(env.COURSE_CHAT ? { chat: chatAuthorActor(env.COURSE_CHAT) } : {}),
  };
}
