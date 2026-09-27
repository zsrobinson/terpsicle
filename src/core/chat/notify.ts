import {
  type CourseCode,
  chatHref,
  parseRoomId,
  type RoomId,
  type TermId,
} from "../schema";
import type { Room } from "./rooms";

// Who a chat message notifies, and what they see (V2.md §6.1, §6.4, §6.6).
// A message notifies once it's visible to the room: each person it
// mentions, and the author of the thread it replies in.

export type ChatNotificationType = "chat-mention" | "chat-reply";

/** Chat pushes per person per hour, at most (V2.md §6.4); tags collapse the rest anyway. */
export const CHAT_PUSHES_PER_HOUR = 30;

/** Characters of a message a push or a digest line shows. */
export const CHAT_PREVIEW_CHARS = 120;

export type ChatRecipient = {
  readonly userId: string;
  readonly type: ChatNotificationType;
  /** False for someone looking at the course's chat now, or a reply in a room they muted. */
  readonly push: boolean;
};

/**
 * Who hears about a message: everyone it mentions, then the author of the
 * thread it replies in (a mention wins: one notification each). Never its
 * author. Someone connected to the course's chat gets no push (they're
 * looking); a muted room sends no push for replies, but mentions still do
 * (you were named).
 */
export function chatRecipients(m: {
  author: string;
  mentioned: readonly string[];
  /** The thread's first message's author, for a reply; null otherwise. */
  threadAuthor: string | null;
  connected: ReadonlySet<string>;
  muted: ReadonlySet<string>;
}): ChatRecipient[] {
  const out: ChatRecipient[] = [];
  for (const userId of m.mentioned)
    if (userId !== m.author && !out.some((r) => r.userId === userId))
      out.push({
        userId,
        type: "chat-mention",
        push: !m.connected.has(userId),
      });
  const t = m.threadAuthor;
  if (t !== null && t !== m.author && !out.some((r) => r.userId === t))
    out.push({
      userId: t,
      type: "chat-reply",
      push: !m.connected.has(t) && !m.muted.has(t),
    });
  return out;
}

/** The event's key, the same every time the message is published: one notification per person per message. */
export function chatNotificationKey(
  type: ChatNotificationType,
  userId: string,
  messageId: string,
): string {
  return `${type}:${userId}:${messageId}`;
}

/** Whitespace folded, cut at a word to `max` characters with "…". */
export function chatPreview(text: string, max = CHAT_PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Where a message is, in a few words: "CMSC131" for the course room,
 * "CMSC131 · 0303", "CMSC131 · Sadeghian's sections". `room` is the
 * catalog's, when the object has it.
 */
export function chatPlaceWords(roomId: RoomId, room: Room | null): string {
  const parsed = parseRoomId(roomId);
  if (!parsed) return roomId;
  const { courseCode, kind, sectionCode } = parsed;
  if (kind === "course") return courseCode;
  if (kind === "section") return `${courseCode} · ${sectionCode}`;
  return room?.words ? `${courseCode} · ${room.words}` : courseCode;
}

/** "Hannah Lee mentioned you in CMSC131 · 0303", "Hannah Lee replied in CMSC131". */
export function chatHeadline(
  type: ChatNotificationType,
  actor: string,
  place: string,
): string {
  return type === "chat-mention"
    ? `${actor} mentioned you in ${place}`
    : `${actor} replied in ${place}`;
}

/** The room (and thread) a notification opens. */
export function chatMessageHref(m: {
  termId: TermId;
  courseCode: CourseCode;
  roomId: RoomId;
  /** The thread's first message, for a reply; null for a top-level message. */
  thread: string | null;
}): string {
  return chatHref({
    term: m.termId,
    course: m.courseCode,
    room: m.roomId,
    ...(m.thread ? { thread: m.thread } : {}),
  });
}

/** Push tags are 64 characters at most; a long professor room is cut (a shared tag only collapses). */
export function chatPushTag(roomId: RoomId): string {
  return `chat:${roomId}`.slice(0, 64);
}

/** What the push shows: who and where, a preview of the text, and the room to open. */
export function chatPush(m: {
  type: ChatNotificationType;
  actor: string;
  place: string;
  text: string;
  termId: TermId;
  courseCode: CourseCode;
  roomId: RoomId;
  thread: string | null;
}): { title: string; body: string; url: string; tag: string } {
  return {
    title: chatHeadline(m.type, m.actor, m.place).slice(0, 120),
    body: chatPreview(m.text),
    url: chatMessageHref(m),
    tag: chatPushTag(m.roomId),
  };
}

/** "3 unread in your class chats". */
export function chatDigestSubject(n: number): string {
  return `${n} unread in your class chats`;
}

/** The digest's line for one: "Hannah Lee replied in CMSC131 · 0303: …". */
export function chatDigestLine(m: {
  type: ChatNotificationType;
  actor: string;
  place: string;
  text: string;
}): string {
  return `${chatHeadline(m.type, m.actor, m.place)}: ${chatPreview(m.text)}`;
}
