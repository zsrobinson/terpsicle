import { type ChatLocation, roomLocation } from "~/core/chat/room-paths";
import type { ChatMessageId, CourseCode, RoomId } from "~/core/schema";

// Moving around Chat: the list is `/chat` and a room `/chat/<COURSE>/<room>`
// (~/core/chat/room-paths). The page reads where it is as a `ChatView` and
// moves by room id, which the route turns into a path.

/** Where the page is, as its link says it. */
export type ChatView = ChatLocation;

/** Where to go: a room by its id, and its thread. Nothing is the list. */
export type ChatTarget = {
  readonly course?: CourseCode;
  readonly room?: RoomId;
  readonly thread?: ChatMessageId;
  readonly join?: 1;
};

export type ChatGo = (
  next: ChatTarget,
  options?: { replace?: boolean },
) => void;

/** A target as a link's location. */
export function targetLocation(target: ChatTarget): ChatLocation {
  if (target.room)
    return {
      ...roomLocation(target.room, target.thread ?? null),
      ...(target.join ? { join: target.join } : {}),
    };
  return target.course
    ? { course: target.course, ...(target.join ? { join: target.join } : {}) }
    : {};
}
