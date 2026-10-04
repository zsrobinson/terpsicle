import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { Join, Room } from "~/core/chat";
import type {
  ChatAuthor,
  ChatLatestMessage,
  ChatUnreadRoom,
  CourseCode,
  CourseSearchRow,
  RoomId,
  TermId,
} from "~/core/schema";
import { retryApi } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";
import { chatClient } from "./chat-client";
import { pullSynced, type Synced } from "./chat-data";
import { chatUnreadQuery } from "./unread-query";

// Chat's server data read through TanStack Query (docs/decisions.md,
// "TanStack Query for server data"). The list's unread counts and each
// room's newest message are queries too, which the course sockets write
// into as messages land (./chat-home's `listLive`): the socket is the live
// feed, and these are what it feeds.

/**
 * The keys of Chat's per-person answers, for the socket's writes. The
 * unread counts are ./unread-query's, which Home reads too.
 */
export const chatKeys = {
  latest: (termId: TermId, courseCode: CourseCode) =>
    ["chat", "latest", termId, courseCode] as const,
  synced: ["chat", "synced"] as const,
};

/** A course's rooms' newest messages, the list's second line (the owner, 2026-09-29). */
export interface CourseLatest {
  byRoom: Readonly<Record<RoomId, ChatLatestMessage>>;
  /**
   * The `lastSeq` each room's newest was asked at, or moved to by the
   * socket: a room whose unread row has moved past it is asked again.
   */
  seqs: Readonly<Record<RoomId, number>>;
}

const NO_LATEST: CourseLatest = { byRoom: {}, seqs: {} };

/**
 * A course's rooms' newest messages, from the course's object, for the
 * rooms its unread rows list (only rooms with messages have one). Current
 * until a room's `lastSeq` moves without its socket saying so
 * (`latestBehind`): the socket keeps it current otherwise.
 */
export function chatLatestQuery(termId: TermId, courseCode: CourseCode) {
  const queryKey = chatKeys.latest(termId, courseCode);
  return queryOptions({
    queryKey,
    queryFn: async ({ client, signal }): Promise<CourseLatest> => {
      const rows = (
        client.getQueryData(chatUnreadQuery(termId).queryKey) ?? []
      ).filter((r) => r.courseCode === courseCode);
      const { latest } =
        rows.length === 0
          ? { latest: [] }
          : await chatClient().chat.latest(
              { termId, courseCode, rooms: rows.map((r) => r.room) },
              { signal },
            );
      // The server's answer for the rooms it names; what a socket brought
      // for any other room stays.
      const had = client.getQueryData<CourseLatest>(queryKey) ?? NO_LATEST;
      return {
        byRoom: {
          ...had.byRoom,
          ...Object.fromEntries(latest.map((m) => [m.room, m])),
        },
        seqs: {
          ...had.seqs,
          ...Object.fromEntries(rows.map((r) => [r.room, r.lastSeq])),
        },
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: retryApi,
  });
}

/**
 * Whether a course's newest messages need asking for again: a room with
 * messages was never asked about, or (while its course has no open
 * socket to say so) has had messages since.
 */
export function latestBehind(
  entry: CourseLatest | undefined,
  rows: readonly ChatUnreadRoom[],
  live: boolean,
): boolean {
  if (!entry) return false;
  return rows.some(
    (r) =>
      entry.seqs[r.room] === undefined ||
      (!live && entry.seqs[r.room] !== r.lastSeq),
  );
}

/**
 * The entry with a room's newest message as a socket or the open room has
 * it: the same message changes nothing, and an edit of an older one
 * doesn't take the newest one's place. `seq` moves the room's asked-at
 * seq with it, so a message the socket brought isn't asked for again.
 */
export function withLatest(
  entry: CourseLatest | undefined,
  message: ChatLatestMessage,
  seq?: number,
): CourseLatest {
  const had = entry ?? NO_LATEST;
  const before = had.byRoom[message.room];
  const same =
    before !== undefined &&
    before.createdAt === message.createdAt &&
    before.text === message.text &&
    before.deleted === message.deleted;
  const older = before !== undefined && before.createdAt > message.createdAt;
  const byRoom =
    same || older ? had.byRoom : { ...had.byRoom, [message.room]: message };
  const seqs =
    seq === undefined || had.seqs[message.room] === seq
      ? had.seqs
      : { ...had.seqs, [message.room]: seq };
  return entry && byRoom === had.byRoom && seqs === had.seqs
    ? entry
    : { byRoom, seqs };
}

/**
 * Your synced plans and settings, from sync/pull: the server's copy, as
 * the server checks rooms against it. The sync engine and its IndexedDB
 * stay with Schedule and Plan, so /chat stays light. Each visit to Chat
 * asks again, since a plan you just changed in Schedule moves your rooms,
 * and shows the copy it has meanwhile; so does coming back to the tab a
 * minute later. Only Chat's page asks; the rest of Chat reads its copy.
 */
export function chatSyncedQuery() {
  return queryOptions({
    queryKey: chatKeys.synced,
    queryFn: (): Promise<Synced> => pullSynced(chatClient()),
    staleTime: 60_000,
    refetchOnMount: "always",
    retry: retryApi,
  });
}

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
