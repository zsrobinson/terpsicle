import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { Join, Room } from "~/core/chat";
import type { ChatAuthor, CourseSearchRow } from "~/core/schema";
import { retryApi } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";

// Chat's server data read through TanStack Query (docs/decisions.md,
// "TanStack Query for server data"). The list's counts and newest messages
// stay in ./chat-home, which the socket and the unread poll keep current.

/** A room's joins, for its timeline's grouped lines. Asked again as you come back to the tab. */
export function roomJoinsQuery(room: Room) {
  return queryOptions({
    queryKey: ["chat", "joins", room.id],
    queryFn: async (): Promise<readonly Join[]> => {
      const result = await chatApi.joins({
        termId: room.termId,
        courseCode: room.courseCode,
        roomId: room.id,
      });
      return result.status === "ok" ? result.joins : [];
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Who's in a room changes slowly: its member list (for "@") and head count
 * (course details' "Join CMSC351 chat · 42 people") count as current this
 * long, and are asked again after it as you come back to the tab.
 */
export const MEMBERS_STALE_MS = 5 * 60_000;

/** A room's members: up to 200 of them by name, and how many in all. */
export interface RoomMembers {
  members: readonly ChatAuthor[];
  total: number;
}

/**
 * A room's members, one copy per room for the page: Schedule's course
 * details and Chat's room share it. A room you can't read (or that isn't
 * there) fails, so nothing is kept and the next ask tries again.
 */
export function roomMembersQuery(
  room: Pick<Room, "id" | "termId" | "courseCode">,
) {
  return queryOptions({
    queryKey: ["chat", "members", room.id],
    queryFn: async (): Promise<RoomMembers> => {
      const result = await chatApi.members({
        termId: room.termId,
        courseCode: room.courseCode,
        roomId: room.id,
      });
      if (result.status !== "ok") throw new Error(result.status);
      return { members: result.members, total: result.total };
    },
    staleTime: MEMBERS_STALE_MS,
    retry: retryApi,
  });
}

/**
 * Who can be @-mentioned in a room: its members (at most 200), you aside.
 * The list is the room's `roomMembersQuery`, so another "@", or coming
 * back to the room, within a few minutes doesn't ask again; after a
 * failure, the next "@" does.
 */
export async function mentionable(
  client: QueryClient,
  room: Pick<Room, "id" | "termId" | "courseCode">,
  you: string | undefined,
): Promise<ChatAuthor[]> {
  const { members } = await client.fetchQuery(roomMembersQuery(room));
  return members.filter((m) => m.directoryId !== you);
}

/**
 * Every course's code and title, any term (the course index's search
 * file, ./chat-reads), for finding any course's room. Loaded on first use,
 * so /chat's first load doesn't carry every course; built over the file's
 * own query, which keeps its freshness and stays saved on this device, so
 * this copy is kept for the page. The file's reads retry themselves; it
 * reads the disk offline instead of pausing.
 */
export function chatCourseRowsQuery() {
  return queryOptions({
    queryKey: ["chat", "course-rows"],
    queryFn: async ({ client }): Promise<readonly CourseSearchRow[]> =>
      (await import("./chat-reads")).readCourseSearch(client),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    networkMode: "always",
  });
}
