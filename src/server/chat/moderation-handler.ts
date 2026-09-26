// Chat's side of moderation's later decisions (docs/MODERATION.md §6): a
// retry that passes, or the owner, reaches the message's CourseChat object,
// which shows, holds or removes it and tells the room.
import {
  ChatMessageIdSchema,
  CourseCodeSchema,
  courseRoomId,
  type ModerationReason,
  TermIdSchema,
} from "~/core/schema";
import type { CourseChatNamespace } from "./course-chat";

/** What a chat message is called in moderation: `<termId>:<courseCode>:<messageId>`. */
export function chatTargetId(
  termId: string,
  courseCode: string,
  messageId: string,
): string {
  return `${termId}:${courseCode}:${messageId}`;
}

export function parseChatTargetId(
  targetId: string,
): { termId: string; courseCode: string; messageId: string } | null {
  const [termId, courseCode, messageId, ...rest] = targetId.split(":");
  if (
    rest.length > 0 ||
    !TermIdSchema.safeParse(termId).success ||
    !CourseCodeSchema.safeParse(courseCode).success ||
    !ChatMessageIdSchema.safeParse(messageId).success
  )
    return null;
  // The checks above guarantee all three are strings.
  return {
    termId: termId as string,
    courseCode: courseCode as string,
    messageId: messageId as string,
  };
}

/**
 * Chat's handler. The optional third argument matches the handler context
 * v2/reviews-api adds (`{db, now, reasons}`): with reasons, a hold says why
 * (graded work or flagged) instead of just "flagged".
 */
export function chatModerationHandler(namespace: CourseChatNamespace) {
  return async (
    targetId: string,
    decision: "publish" | "hold" | "remove",
    ctx?: { reasons?: readonly ModerationReason[] },
  ): Promise<void> => {
    const target = parseChatTargetId(targetId);
    // Not one of ours (a malformed ref): nothing to deliver.
    if (!target) return;
    const stub = namespace.get(
      namespace.idFromName(courseRoomId(target.termId, target.courseCode)),
    );
    await stub.applyDecision({
      ...target,
      decision,
      ...(ctx?.reasons ? { reasons: [...ctx.reasons] } : {}),
    });
  };
}
