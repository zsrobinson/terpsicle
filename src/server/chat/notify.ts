// Mentions and replies (V2.md §6.1, §6.7, §8.4 step 4): once a message is
// visible to its room, the CourseChat object notifies each person it
// mentions and the author of the thread it replies in, through notify(),
// which writes their inbox row and, unless they're looking at the course's
// chat now or (for a reply) muted the room, pushes. A room's mentions and a
// thread's replies are one notification each, updated with a count, so
// nothing is capped. One notification per person per message, however
// often it's published again.
import {
  CHAT_MENTIONS_MAX,
  type ChatRecipient,
  canReadRoom,
  chatMessageHref,
  chatNotificationKey,
  chatPlaceWords,
  chatRecipients,
  findMentions,
  roomSectionCodes,
} from "~/core/chat";
import { chatMentionTag, chatReplyTag } from "~/core/notifications";
import { parseRoomId } from "~/core/schema";
import { type NotifyEnv, notify } from "../notifications/notify";
import type { ChatCourse } from "./catalog";
import type { MessageRow } from "./object-store";
import {
  chatNotificationId,
  mentionedAlready,
  mutedIn,
  planSections,
  roomMembers,
} from "./store";

/** Members a mention is looked up among; far above any course's head count. */
const MENTION_LOOKUP_MAX = 5_000;

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

/**
 * Notifies everyone a newly visible message is for. Returns who it
 * notified for the first time, with whether each was to be pushed (for
 * tests and logs).
 */
export async function notifyChatMessage(
  env: NotifyEnv,
  input: ChatNotifyInput,
): Promise<ChatRecipient[]> {
  const { row, course, now } = input;
  const parsed = parseRoomId(row.room_id);
  if (!parsed) return [];
  const { termId, courseCode } = parsed;
  // Five mentions per message, not per version: an edit can't name five
  // more people each time it's published again.
  const named = await mentionsIn(env.DB, row, course);
  const earlier =
    named.length === 0
      ? new Set<string>()
      : await mentionedAlready(env.DB, termId, courseCode, row.id);
  let left = CHAT_MENTIONS_MAX - earlier.size;
  const mentioned = named.filter((id) => earlier.has(id) || left-- > 0);
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
  const url = chatMessageHref({
    termId,
    courseCode,
    roomId: row.room_id,
    thread: row.reply_to,
  });
  const done: ChatRecipient[] = [];
  for (const r of recipients) {
    const result = await chatNotifier.notify(
      env,
      r.userId,
      {
        type: r.type,
        key: chatNotificationKey(r.type, r.userId, row.id),
        inbox: [
          {
            id: chatNotificationId(r.userId, termId, courseCode, row.id),
            // A reply is in a thread, so it has the thread's first message.
            groupKey:
              r.type === "chat-reply" && row.reply_to !== null
                ? chatReplyTag(row.reply_to)
                : chatMentionTag(row.room_id),
            termId,
            courseCode,
            chat: {
              roomId: row.room_id,
              threadId: row.reply_to,
              seq: row.seq,
              messageId: row.id,
              actorId: row.author_id,
            },
          },
        ],
        ...(r.push
          ? {
              push: {
                event: {
                  type: r.type,
                  actor: input.actorName,
                  place,
                  text: row.body,
                },
                url,
              },
            }
          : {}),
      },
      { now },
    );
    if (result.inbox === "new") done.push(r);
  }
  return done;
}

/**
 * How the object notifies. An object, not bare imports, so worker tests can
 * see who was notified and wait for it (the object runs in the test's
 * isolate).
 */
export const chatNotifier = { notify, message: notifyChatMessage };
