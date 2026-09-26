import { z } from "zod";
import {
  ChatAuthorSchema,
  ChatMessageIdSchema,
  parseRoomId,
  RoomIdSchema,
} from "./chat";
import {
  CourseCodeSchema,
  IsoDateTimeSchema,
  TermIdSchema,
} from "./primitives";

// Chat's JSON routes (docs/V2.md §8.5), all `auth: "user"`, and the socket
// route's query. Messages themselves travel over the socket (./chat).

// ---------- /chat's search params ----------

/**
 * Where you are in Chat, so a room has a link and the back button walks
 * back out: the list, a course's rooms, a room, a thread. `join=1` (from the
 * scheduler's "Join CMSC351 chat") follows the course once you're signed in.
 */
export const ChatSearchSchema = z.object({
  term: TermIdSchema.optional().catch(undefined),
  course: CourseCodeSchema.optional().catch(undefined),
  room: RoomIdSchema.optional().catch(undefined),
  thread: ChatMessageIdSchema.optional().catch(undefined),
  // The router may parse "1" as a number.
  join: z
    .union([z.literal(1), z.literal("1")])
    .transform(() => 1 as const)
    .optional()
    .catch(undefined),
});
export type ChatView = z.infer<typeof ChatSearchSchema>;

/** `/chat?…` for a view: links from the scheduler, and sign-in's way back. */
export function chatHref(view: ChatView): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(view))
    if (value !== undefined) params.set(key, String(value));
  const query = params.toString();
  return query ? `/chat?${query}` : "/chat";
}

// ---------- what Chat keeps in the browser (localStorage) ----------

/** Course rooms joined from this browser, per term (the server has them too). */
export const ChatJoinedStoreSchema = z.record(
  TermIdSchema,
  z.array(CourseCodeSchema),
);
export type ChatJoinedStore = z.infer<typeof ChatJoinedStoreSchema>;

/** Courses whose room rules this browser has seen. */
export const ChatRulesSeenStoreSchema = z.array(CourseCodeSchema);

// ---------- GET /api/chat/socket ----------

/** `?term=<termId>&course=<code>`: which course's object to open. */
export const ChatSocketQuerySchema = z.strictObject({
  term: TermIdSchema,
  course: CourseCodeSchema,
});
export type ChatSocketQuery = z.infer<typeof ChatSocketQuerySchema>;

const course = { termId: TermIdSchema, courseCode: CourseCodeSchema };

/** The room must be one of the named course's rooms. */
const inCourse = (v: {
  termId: string;
  courseCode: string;
  roomId: string;
}) => {
  const parsed = parseRoomId(v.roomId);
  return parsed?.termId === v.termId && parsed.courseCode === v.courseCode;
};
const IN_COURSE = {
  message: "The room isn't one of this course's",
  path: ["roomId"],
};

// ---------- POST /api/chat/unread ----------

export const ChatUnreadInputSchema = z.strictObject({ termId: TermIdSchema });
export type ChatUnreadInput = z.infer<typeof ChatUnreadInputSchema>;

export const ChatUnreadRoomSchema = z.object({
  room: RoomIdSchema,
  courseCode: CourseCodeSchema,
  /** The seq of the room's latest visible message. */
  lastSeq: z.number().int().min(1),
  /** Messages after your read marker (yours included, until you read). */
  unread: z.number().int().min(0),
  lastMessageAt: IsoDateTimeSchema,
  muted: z.boolean(),
});
export type ChatUnreadRoom = z.infer<typeof ChatUnreadRoomSchema>;

/**
 * Your rooms (chat plan and follows) that have messages, from one D1 query:
 * opening the chat list wakes no objects. A room with no messages isn't
 * listed, since nothing is stored for it (V2 §8.3).
 */
export const ChatUnreadResultSchema = z.object({
  rooms: z.array(ChatUnreadRoomSchema),
});
export type ChatUnreadResult = z.infer<typeof ChatUnreadResultSchema>;

// ---------- POST /api/chat/follow, chat/unfollow ----------

/** Course rooms you opened from outside your plan, per term, at most. */
export const CHAT_MAX_FOLLOWS = 100;

export const ChatFollowInputSchema = z.strictObject(course);
export type ChatFollowInput = z.infer<typeof ChatFollowInputSchema>;

export const ChatFollowResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  /** Already following CHAT_MAX_FOLLOWS courses this term. */
  z.object({ status: z.literal("too-many") }),
]);
export type ChatFollowResult = z.infer<typeof ChatFollowResultSchema>;

export const ChatUnfollowResultSchema = z.object({
  status: z.literal("ok"),
});
export type ChatUnfollowResult = z.infer<typeof ChatUnfollowResultSchema>;

// ---------- POST /api/chat/mute ----------

export const ChatMuteInputSchema = z
  .strictObject({ ...course, roomId: RoomIdSchema, muted: z.boolean() })
  .refine(inCourse, IN_COURSE);
export type ChatMuteInput = z.infer<typeof ChatMuteInputSchema>;

export const ChatMuteResultSchema = z.object({ status: z.literal("ok") });
export type ChatMuteResult = z.infer<typeof ChatMuteResultSchema>;

// ---------- POST /api/chat/members ----------

/** People listed per room, at most (V2 §8.5). */
export const CHAT_MEMBERS_MAX = 200;

export const ChatMembersInputSchema = z
  .strictObject({ ...course, roomId: RoomIdSchema })
  .refine(inCourse, IN_COURSE);
export type ChatMembersInput = z.infer<typeof ChatMembersInputSchema>;

export const ChatMembersResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** By name, at most CHAT_MEMBERS_MAX. */
    members: z.array(ChatAuthorSchema),
    /** Everyone in the room, which can be more than `members`. */
    total: z.number().int().min(0),
  }),
  /** Professor and section rooms need one of their sections in one of your plans. */
  z.object({ status: z.literal("not-a-member") }),
  /** No such course or room in the catalog. */
  z.object({ status: z.literal("not-found") }),
]);
export type ChatMembersResult = z.infer<typeof ChatMembersResultSchema>;
