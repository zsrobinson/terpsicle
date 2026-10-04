import { queryOptions, skipToken } from "@tanstack/react-query";
import type { ChatUnreadRoom, TermId } from "~/core/schema";
import { retryApi } from "~/server/fns/api";
import { chatClient } from "./chat-client";

// Your rooms' unread counts, Chat's and Home's one copy (docs/decisions.md,
// "TanStack Query for server data"). On its own, apart from ./queries, so
// Home's first load carries this and nothing else of Chat's.

/** The unread counts' key, for the socket's writes (./chat-home's `listLive`). */
export const unreadKey = (termId: TermId | null) =>
  ["chat", "unread", termId] as const;

/**
 * How often your rooms' unread counts are asked for while Chat or Home is
 * open and on screen (V2 §8.3: one D1 query that wakes no room). A hidden
 * tab doesn't ask; coming back to it does, once the counts are
 * `UNREAD_STALE_MS` old.
 */
export const UNREAD_EVERY_MS = 60_000;
export const UNREAD_STALE_MS = 30_000;

/**
 * Your rooms in a term that have messages, with their unread counts: one
 * copy for the page, which Chat's list, the tab's title and Home's Chat
 * part all read, and which each course's socket keeps current between
 * asks. Only the page itself asks (Chat's page, or Home); the rest read
 * the copy (`enabled: false`), so it's asked once a minute however many
 * places show it.
 */
export function chatUnreadQuery(termId: TermId | null) {
  return queryOptions<
    ChatUnreadRoom[],
    Error,
    ChatUnreadRoom[],
    ReturnType<typeof unreadKey>
  >({
    queryKey: unreadKey(termId),
    queryFn:
      termId === null
        ? skipToken
        : async ({ signal }) =>
            (await chatClient().chat.unread({ termId }, { signal })).rooms,
    staleTime: UNREAD_STALE_MS,
    refetchInterval: UNREAD_EVERY_MS,
    retry: retryApi,
  });
}
