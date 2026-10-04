import { useEffect, useRef } from "react";
import type { ChatListCourse } from "~/core/chat";
import type { CourseCode, RoomId, TermId } from "~/core/schema";
import { listLive } from "./chat-home";
import { CourseChatSession } from "./session";
import type { SocketLike } from "./socket";

// The list in realtime (the owner, 2026-09-29: previews "in realtime for
// chats besides the one that's currently selected"). Each course in the
// list keeps its course's socket open, listening to your rooms there: the
// `CourseChat` object already sends every room's messages to the sockets
// that read it, and hibernates between them, so a course's rooms cost one
// connection and nothing new on the server. The open room's course reuses
// its own socket (./chat-page passes `listLive` to it). While a socket is
// down, the unread poll asks `chat/latest` for that course instead.

/** One listening socket per course in the list, except the open room's. */
export function useLiveList(
  termId: TermId | null,
  list: readonly ChatListCourse[],
  openCourse: CourseCode | null,
  open?: (url: string) => SocketLike,
): void {
  const sessions = useRef(new Map<CourseCode, CourseChatSession>());
  const wanted = new Map<CourseCode, readonly RoomId[]>();
  if (termId)
    for (const c of list)
      if (c.courseCode !== openCourse && c.rooms.length > 0)
        wanted.set(
          c.courseCode,
          c.rooms.map((r) => r.room.id),
        );
  // A stable key, so a new list with the same rooms changes nothing.
  const key = [...wanted]
    .map(([code, rooms]) => `${code}=${rooms.join(",")}`)
    .sort()
    .join(";");

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key says what's wanted
  useEffect(() => {
    if (!termId) return;
    const live = sessions.current;
    for (const [code, session] of live)
      if (!wanted.has(code) || session.termId !== termId) {
        session.close();
        live.delete(code);
      }
    for (const [code, rooms] of wanted) {
      const session = live.get(code);
      if (session) session.setRooms(rooms);
      else
        live.set(
          code,
          new CourseChatSession({
            termId,
            courseCode: code,
            rooms,
            live: listLive,
            ...(open ? { open } : {}),
          }),
        );
    }
  }, [termId, key, open]);

  useEffect(() => {
    const live = sessions.current;
    return () => {
      for (const session of live.values()) session.close();
      live.clear();
    };
  }, []);
}
