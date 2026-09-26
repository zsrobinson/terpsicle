import { z } from "zod";
import {
  type CourseCode,
  DirectoryIdSchema,
  IsoDateTimeSchema,
  type SectionCode,
  type TermId,
} from "./primitives";

// Terpsicle Chat: room ids, messages, and the WebSocket protocol between the
// app and a course's `CourseChat` Durable Object. Rooms themselves aren't
// stored: `~/core/chat` derives them from the catalog.

// ---------- room ids ----------

/**
 * `<term>:<course>` for the course room, `<term>:<course>:<section>` for a
 * section room and `<term>:<course>:P:<professor>` for a professor's room
 * (`professorSlug`: "pedram-sadeghian", co-instructors joined by "_"). Section
 * and course rooms are built from codes, so they keep their id (and their
 * history) when a time or place changes; a professor's room is theirs, so
 * it's named after them. The course room's id is also the `CourseChat`
 * object's name.
 */
export const RoomIdSchema = z
  .string()
  .regex(
    /^\d{4}(?:01|05|08|12):[A-Z]{4}\d{3}[A-Z]?(?::(?:[A-Z0-9]{4}|P:[a-z0-9]+(?:[-_][a-z0-9]+)*))?$/,
    "Expected a room id like YYYYMM:CMSC131:0101",
  );
export type RoomId = z.infer<typeof RoomIdSchema>;

export const RoomKindSchema = z.enum(["course", "professor", "section"]);
export type RoomKind = z.infer<typeof RoomKindSchema>;

/** Longest professor slug, so a room id stays short with many co-instructors. */
const PROFESSOR_SLUG_MAX = 80;

/**
 * A professor room's name in its id: "Pedram Sadeghian" → "pedram-sadeghian",
 * "José Núñez" → "jose-nunez", co-instructors "ada-brandt_lee-moss".
 */
export function professorSlug(instructors: readonly string[]): string {
  const slug = instructors
    .map((name) =>
      name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("_")
    .slice(0, PROFESSOR_SLUG_MAX);
  // A cut can end on a separator; the id's grammar doesn't allow one there.
  return slug.replace(/[-_]+$/, "");
}

export function courseRoomId(termId: TermId, courseCode: CourseCode): RoomId {
  return `${termId}:${courseCode}`;
}

/** `instructors` as the sections list them; they must name someone (TBA has no room). */
export function professorRoomId(
  termId: TermId,
  courseCode: CourseCode,
  instructors: readonly string[],
): RoomId {
  return `${termId}:${courseCode}:P:${professorSlug(instructors)}`;
}

export function sectionRoomId(
  termId: TermId,
  courseCode: CourseCode,
  sectionCode: SectionCode,
): RoomId {
  return `${termId}:${courseCode}:${sectionCode}`;
}

export type ParsedRoomId = {
  readonly termId: TermId;
  readonly courseCode: CourseCode;
  readonly kind: RoomKind;
  /** The section room's section; null otherwise. */
  readonly sectionCode: SectionCode | null;
  /** The professor room's `professorSlug`; null otherwise. */
  readonly professor: string | null;
};

/** Splits a room id; null when it isn't one. */
export function parseRoomId(id: string): ParsedRoomId | null {
  if (!RoomIdSchema.safeParse(id).success) return null;
  const [termId = "", courseCode = "", a, b] = id.split(":");
  const base = { termId, courseCode, sectionCode: null, professor: null };
  if (a === undefined) return { ...base, kind: "course" };
  if (b === undefined) return { ...base, kind: "section", sectionCode: a };
  return { ...base, kind: "professor", professor: b };
}

/** The `CourseChat` object a room lives in: one per course per term. */
export function courseChatName(id: RoomId): RoomId {
  const parsed = parseRoomId(id);
  return parsed ? courseRoomId(parsed.termId, parsed.courseCode) : id;
}

// ---------- messages ----------

/** Minted by the `CourseChat` object; unique within it. */
export const ChatMessageIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Expected a message id");
export type ChatMessageId = z.infer<typeof ChatMessageIdSchema>;

/** Longer messages are refused before moderation sees them. */
export const CHAT_TEXT_MAX = 2000;

export const ChatTextSchema = z.string().trim().min(1).max(CHAT_TEXT_MAX);

/**
 * Who wrote a message, as they were when they wrote it: real names and
 * Google pictures (no pseudonyms), snapshotted so a later name change
 * doesn't rewrite history.
 */
export const ChatAuthorSchema = z.object({
  directoryId: DirectoryIdSchema,
  /** The Google account's name. */
  name: z.string().trim().min(1).max(120),
  /** The Google picture, or our cached copy of it; null when there's none. */
  picture: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .nullable(),
});
export type ChatAuthor = z.infer<typeof ChatAuthorSchema>;

/** The fixed reaction set from the Chat canvas. Words are in `~/core/chat`. */
export const REACTIONS = [
  "thumbs",
  "check",
  "eyes",
  "laugh",
  "question",
] as const;
export const ReactionSchema = z.enum(REACTIONS);
export type Reaction = z.infer<typeof ReactionSchema>;

/** Who reacted, per reaction, in the order they did. Absent reactions have nobody. */
export const ReactionsSchema = z.partialRecord(
  ReactionSchema,
  z.array(DirectoryIdSchema).min(1),
);
export type Reactions = z.infer<typeof ReactionsSchema>;

/** Why a message is held back from everyone but its author. */
export const HeldReasonSchema = z.enum([
  /** The model hasn't answered yet ("Checking before classmates see it…"). */
  "checking",
  /** It looks like answers to graded work; a person checks it. */
  "graded-work",
  /** Flagged by the safety model or the rules; a person checks it. */
  "flagged",
  /** Reports reached the hiding weight; a person decides. */
  "reported",
]);
export type HeldReason = z.infer<typeof HeldReasonSchema>;

/**
 * Model-first moderation. `visible`: everyone in the room sees it. `held`:
 * only its author does, with a note. `removed`: taken down by the owner;
 * only its author is told, and nobody sees the text.
 */
export const ModerationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("visible") }),
  z.object({ state: z.literal("held"), reason: HeldReasonSchema }),
  z.object({ state: z.literal("removed") }),
]);
export type Moderation = z.infer<typeof ModerationSchema>;
export type ModerationState = Moderation["state"];

/** "3 replies · last 12:03am" under a message that started a thread. */
export const ThreadSummarySchema = z.object({
  count: z.number().int().min(1),
  lastAt: IsoDateTimeSchema,
});
export type ThreadSummary = z.infer<typeof ThreadSummarySchema>;

export const ChatMessageSchema = z.object({
  id: ChatMessageIdSchema,
  room: RoomIdSchema,
  author: ChatAuthorSchema,
  text: ChatTextSchema,
  createdAt: IsoDateTimeSchema,
  /** null until the author edits it. */
  editedAt: IsoDateTimeSchema.nullable(),
  /** The message whose thread this reply is in; null for a top-level message. Threads are one level deep. */
  replyTo: ChatMessageIdSchema.nullable(),
  /** Replies so far; null when nobody has replied (and always on a reply). */
  thread: ThreadSummarySchema.nullable(),
  reactions: ReactionsSchema,
  moderation: ModerationSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ---------- the WebSocket protocol ----------

/**
 * Bumped on any breaking change to the frames below. A client whose `hello`
 * carries an older version gets `error {code: "old-client"}` and reloads.
 */
export const CHAT_PROTOCOL_VERSION = 1;

/** Frames per history page, at most. */
export const CHAT_PAGE_MAX = 100;

/** A client-chosen id that ties an `ack` or `error` to its request. */
export const ChatRequestIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "Expected a request id");
export type ChatRequestId = z.infer<typeof ChatRequestIdSchema>;

const req = ChatRequestIdSchema;
const room = RoomIdSchema;
const id = ChatMessageIdSchema;

// Client → server. Strict: these come from the network. One socket per
// course, so every frame names its room.

export const ChatClientFrameSchema = z.discriminatedUnion("type", [
  /** First frame on a new socket: which rooms of this course to follow live. */
  z.strictObject({
    type: z.literal("hello"),
    protocol: z.number().int().min(1),
    rooms: z.array(room).min(1).max(256),
  }),
  /**
   * A page of messages before `before` (null: the newest), oldest first.
   * With `thread`, that thread's replies; without, top-level messages.
   */
  z.strictObject({
    type: z.literal("history"),
    req,
    room,
    thread: id.nullable(),
    before: id.nullable(),
    limit: z.number().int().min(1).max(CHAT_PAGE_MAX),
  }),
  z.strictObject({
    type: z.literal("send"),
    req,
    room,
    text: ChatTextSchema,
    replyTo: id.nullable(),
  }),
  /** Only the author may edit; an edit is screened again. */
  z.strictObject({
    type: z.literal("edit"),
    req,
    room,
    id,
    text: ChatTextSchema,
  }),
  /** Only the author may delete; a deleted message is gone at once. */
  z.strictObject({ type: z.literal("delete"), req, room, id }),
  /** Add (`on: true`) or take back one of your reactions. */
  z.strictObject({
    type: z.literal("react"),
    req,
    room,
    id,
    reaction: ReactionSchema,
    on: z.boolean(),
  }),
  /** Sent at most every few seconds while typing; never stored. */
  z.strictObject({ type: z.literal("typing"), room }),
  /** Everything up to and including `upTo` has been seen: clears the unread count. */
  z.strictObject({ type: z.literal("read"), room, upTo: id }),
]);
export type ChatClientFrame = z.infer<typeof ChatClientFrameSchema>;

/** A followed room as `welcome` reports it. */
export const ChatRoomStateSchema = z.object({
  room,
  /** People with the room's sections in a plan who've joined Chat. */
  members: z.number().int().min(0),
  unread: z.number().int().min(0),
  /** False once the term is over: the room is readable, not writable. */
  writable: z.boolean(),
});
export type ChatRoomState = z.infer<typeof ChatRoomStateSchema>;

export const ChatErrorCodeSchema = z.enum([
  /** The frame didn't parse. */
  "bad-frame",
  /** The client's protocol is older than the server's: reload. */
  "old-client",
  /** Not signed in, or the session ended. */
  "signed-out",
  /** Professor and section rooms need one of their sections in one of your plans. */
  "not-a-member",
  /** The term is over. */
  "read-only",
  /** No such message (or it was deleted). */
  "not-found",
  /** Editing or deleting someone else's message. */
  "not-yours",
  /** Slow mode or a new account's wait: try again after `retryAfter`. */
  "slow-down",
]);
export type ChatErrorCode = z.infer<typeof ChatErrorCodeSchema>;

// Server → client. Not strict, so a newer server can add fields.

export const ChatServerFrameSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    protocol: z.number().int().min(1),
    you: ChatAuthorSchema,
    rooms: z.array(ChatRoomStateSchema),
  }),
  z.object({
    type: z.literal("page"),
    req,
    room,
    thread: id.nullable(),
    /** Oldest first. The author's own held messages are included; removed ones aren't. */
    messages: z.array(ChatMessageSchema),
    /** Older messages remain. */
    more: z.boolean(),
  }),
  /**
   * A request succeeded. `send`, `edit` and `react` get the message as its
   * author now sees it (a new message usually starts `held: checking`);
   * `delete` gets null.
   */
  z.object({
    type: z.literal("ack"),
    req,
    message: ChatMessageSchema.nullable(),
  }),
  z.object({
    type: z.literal("error"),
    /** null when the frame had no request id (or didn't parse). */
    req: req.nullable(),
    code: ChatErrorCodeSchema,
    /** Seconds to wait, for `slow-down`. */
    retryAfter: z.number().int().min(1).nullable(),
  }),
  /**
   * A message someone may now see, or its new version: new, edited, a new
   * reply in its thread, or visible after its check. Replaces any copy with
   * the same id.
   */
  z.object({ type: z.literal("message"), message: ChatMessageSchema }),
  z.object({ type: z.literal("deleted"), room, id }),
  z.object({
    type: z.literal("reactions"),
    room,
    id,
    reactions: ReactionsSchema,
  }),
  /**
   * A moderation decision. The author gets every change to their message
   * (held, then visible or removed); everyone else gets `removed` for a
   * message they had seen, and drops it.
   */
  z.object({
    type: z.literal("moderation"),
    room,
    id,
    moderation: ModerationSchema,
  }),
  z.object({
    type: z.literal("typing"),
    room,
    who: ChatAuthorSchema.pick({ directoryId: true, name: true }),
  }),
]);
export type ChatServerFrame = z.infer<typeof ChatServerFrameSchema>;
