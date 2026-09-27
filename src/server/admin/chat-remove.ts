// POST /api/admin/chat/remove (V2 §10): the owner takes down a chat message
// found outside the queue, from a pasted link or ref. It goes through the
// queue like any held item (queued, then removed with the reason), so the
// decision log has it without its author, "stop this author" works the same,
// and Undo puts it back in the queue, held.
import { courseRoomId, type ResolveResult } from "~/core/schema";
import type { AdminChatRemoveInput } from "~/core/schema/admin";
import { chatTargetId } from "../chat/moderation-handler";
import { type AdminDeps, resolveQueueItem } from "../moderation/admin";
import type { ModerationHandlerEnv } from "../moderation/handlers";
import {
  queueOpenItem,
  setQueueStatus,
  waitingRowFor,
} from "../moderation/store";

export async function removeChatMessage(
  env: ModerationHandlerEnv & { DB: D1Database },
  input: AdminChatRemoveInput,
  deps: AdminDeps,
): Promise<ResolveResult> {
  if (!env.COURSE_CHAT) return { status: "not-found" };
  const { termId, courseCode, messageId } = input;
  const found = await env.COURSE_CHAT.get(
    env.COURSE_CHAT.idFromName(courseRoomId(termId, courseCode)),
  ).messageForOwner({ termId, courseCode, messageId });
  if (!found) return { status: "not-found" };

  const db = env.DB;
  const ref = chatTargetId(termId, courseCode, messageId);
  const waiting = await waitingRowFor(db, "chat", ref);
  if (waiting?.status === "retry")
    // The owner's call beats the cron's next try.
    await setQueueStatus(db, waiting.id, "open", null).run();
  else if (!waiting)
    await queueOpenItem(db, {
      surface: "chat",
      ref,
      snapshot: {
        text: found.text,
        course: courseCode,
        activeAssignments: false,
        scores: {},
        retries: 0,
      },
      labels: [],
      urgent: false,
      now: deps.now,
    }).run();
  const row = waiting ?? (await waitingRowFor(db, "chat", ref));
  if (!row) return { status: "not-found" };
  return resolveQueueItem(
    db,
    {
      id: row.id,
      action: "remove",
      reason: input.reason,
      ...(input.authorAction ? { authorAction: input.authorAction } : {}),
    },
    deps,
  );
}
