import { queryOptions } from "@tanstack/react-query";
import type { Join, Room } from "~/core/chat";
import { chatApi } from "~/server/fns/chat-api";

// Chat's `/api` answers read through TanStack Query (docs/decisions.md,
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
