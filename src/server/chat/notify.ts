// Mentions and replies (V2.md §6.1, §8.4 step 4): once a message is visible
// to its room, the CourseChat object records a `notifications` row for each
// person it mentions and for the author of the thread it replies in, and
// pushes to them through notify(), unless they're looking at the course's
// chat now, or (for a reply) muted the room. One notification per person
// per message, however often it's published again.
import {
  CHAT_PUSHES_PER_HOUR,
  type ChatRecipient,
  canReadRoom,
  chatNotificationKey,
  chatPlaceWords,
  chatPush,
  chatRecipients,
  findMentions,
  roomSectionCodes,
} from "~/core/chat";
import { parseRoomId } from "~/core/schema";
import { type NotifyEnv, notify } from "../notifications/notify";
import { countDeliveries } from "../notifications/store";
import type { ChatCourse } from "./catalog";
import type { MessageRow } from "./object-store";
import {
  mutedIn,
  planSections,
  recordChatNotification,
  roomMembers,
} from "./store";

/**
 * How the object sends. An object, not a bare import, so worker tests can
 * see who was notified (the object runs in the test's isolate).
 */
export const chatNotifier = { notify };

/** Members a mention is looked up among; far above any course's head count. */
const MENTION_LOOKUP_MAX = 5_000;
const HOUR_MS = 3_600_000;

export interface ChatNotifyInput {
  row: MessageRow;
  course: ChatCourse;
  /** Who wrote it, as the room shows them. */
  actorName: string;
  /** The author of the thread's first message, for a reply; null otherwise. */
  threadAuthor: string | null;
  /** People with a socket open on the course's chat now. */
  connected: ReadonlySet<string>;
  now: Date;
}

/** Who a message mentions, among the people in its room. */
async function mentionsIn(
  db: D1Database,
  row: MessageRow,
  course: ChatCourse,
): Promise<string[]> {
  if (!row.body.includes("@")) return [];
  const parsed = parseRoomId(row.room_id);
  if (!parsed) return [];
  const { members } = await roomMembers(
    db,
    parsed.termId,
    parsed.courseCode,
    parsed.kind === "course"
      ? null
      : roomSectionCodes(course.tree, row.room_id),
    MENTION_LOOKUP_MAX,
  );
  return findMentions(row.body, members, row.author_id);
}

/** Whether the thread's author can still read the room (plans change). */
async function stillReads(
  db: D1Database,
  userId: string,
  row: MessageRow,
  course: ChatCourse,
): Promise<boolean> {
  const parsed = parseRoomId(row.room_id);
  if (!parsed) return false;
  if (parsed.kind === "course") return true;
  const sections = await planSections(
    db,
    userId,
    parsed.termId,
    parsed.courseCode,
  );
  return canReadRoom(course.tree, row.room_id, sections);
}

/** Past the hourly cap, a chat push waits for the digest and the unread count. */
async function underPushCap(
  db: D1Database,
  userId: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - HOUR_MS);
  const counts = await Promise.all(
    (["chat-mention", "chat-reply"] as const).map((type) =>
      countDeliveries(db, { userId, type, channel: "push", since }),
    ),
  );
  return counts.reduce((a, b) => a + b, 0) < CHAT_PUSHES_PER_HOUR;
}

/**
 * Notifies everyone a newly visible message is for. Returns who it
 * recorded, with whether each was pushed to (for tests and logs).
 */
export async function notifyChatMessage(
  env: NotifyEnv,
  input: ChatNotifyInput,
): Promise<ChatRecipient[]> {
  const { row, course, now } = input;
  const parsed = parseRoomId(row.room_id);
  if (!parsed) return [];
  const { termId, courseCode } = parsed;
  const mentioned = await mentionsIn(env.DB, row, course);
  const threadAuthor =
    input.threadAuthor !== null &&
    input.threadAuthor !== row.author_id &&
    !mentioned.includes(input.threadAuthor) &&
    (await stillReads(env.DB, input.threadAuthor, row, course))
      ? input.threadAuthor
      : null;
  if (mentioned.length === 0 && threadAuthor === null) return [];
  const muted = await mutedIn(
    env.DB,
    threadAuthor === null ? [] : [threadAuthor],
    termId,
    courseCode,
    row.room_id,
  );
  const recipients = chatRecipients({
    author: row.author_id,
    mentioned,
    threadAuthor,
    connected: input.connected,
    muted,
  });
  const place = chatPlaceWords(
    row.room_id,
    course.tree.byId.get(row.room_id) ?? null,
  );
  const done: ChatRecipient[] = [];
  for (const r of recipients) {
    const recorded = await recordChatNotification(env.DB, {
      userId: r.userId,
      type: r.type,
      termId,
      courseCode,
      roomId: row.room_id,
      seq: row.seq,
      messageId: row.id,
      actorId: row.author_id,
      at: now.toISOString(),
    });
    if (!recorded) continue;
    const push = r.push && (await underPushCap(env.DB, r.userId, now));
    done.push({ ...r, push });
    if (!push) continue;
    await chatNotifier.notify(
      env,
      r.userId,
      {
        type: r.type,
        key: chatNotificationKey(r.type, r.userId, row.id),
        push: chatPush({
          type: r.type,
          actor: input.actorName,
          place,
          text: row.body,
          termId,
          courseCode,
          roomId: row.room_id,
          thread: row.reply_to,
        }),
      },
      { now },
    );
  }
  return done;
}
