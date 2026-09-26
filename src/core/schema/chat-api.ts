import { z } from "zod";
import { ChatAuthorSchema, parseRoomId, RoomIdSchema } from "./chat";
import {
  CourseCodeSchema,
  IsoDateTimeSchema,
  TermIdSchema,
} from "./primitives";

// Chat's JSON routes (docs/V2.md §8.5), all `auth: "user"`, and the socket
// route's query. Messages themselves travel over the socket (./chat).

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
