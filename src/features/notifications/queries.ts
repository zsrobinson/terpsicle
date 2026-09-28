import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAccount } from "~/features/auth/account-store";
import { retryApi } from "~/lib/query-client";
import { ApiCallError } from "~/server/fns/api";
import { onReadInWorker, syncBadge } from "./badge";

// The bell's server data as TanStack Query queries (docs/V2.md §6.7,
// docs/decisions.md "TanStack Query for server data and its caching"):
// the unread count, the same number as the app badge, and the inbox
// behind it. The count comes from `notifications/unread` on a poll and
// on focus, and from every other answer that has one (a page of the
// inbox, a read, the service worker): each goes through `setUnread`.
// Nothing here is persisted, and signing out forgets it all.
//
// The API client loads on first use, so signed-out pages don't carry it
// (scripts/check-bundle.ts).

const notificationsApi = () =>
  import("~/server/fns/notifications").then((m) => m.notificationsApi);

export const notificationsKeys = {
  /** Everything of the bell's: what signing out forgets. */
  all: ["notifications"] as const,
  unread: ["notifications", "unread"] as const,
  inbox: ["notifications", "inbox"] as const,
};

/** How often the count is asked for while the page shows. */
export const POLL_MS = 2 * 60_000;
/**
 * A count this fresh isn't asked for again when the page shows again (Query
 * refetches on `visibilitychange`), and every answer with a count
 * refreshes it.
 */
export const REFOCUS_MS = 15_000;

/** Whether an answer about the bell may still land: only while signed in. */
const signedIn = () => useAccount.getState().status === "signed-in";

/** The server said the session's gone: asking again won't help. */
const unauthorized = (error: unknown) =>
  error instanceof ApiCallError && error.reason === "unauthorized";

/** The unread count: the bell's number and the app badge. */
export function unreadQuery() {
  return queryOptions({
    queryKey: notificationsKeys.unread,
    queryFn: async ({ signal }) => {
      const { unread } = await (await notificationsApi()).unread({ signal });
      if (signedIn()) syncBadge(unread);
      return unread;
    },
    staleTime: REFOCUS_MS,
    retry: retryApi,
  });
}

/**
 * The inbox, a page at a time, newest first (`before` the last page's
 * `next`). Never fresh: each opening asks again, showing what it had.
 */
export function inboxQuery() {
  return infiniteQueryOptions({
    queryKey: notificationsKeys.inbox,
    queryFn: async ({ pageParam, signal, client }) => {
      const page = await (await notificationsApi()).inbox(
        pageParam === null ? {} : { before: pageParam },
        { signal },
      );
      setUnread(client, page.unread);
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    staleTime: 0,
    retry: retryApi,
  });
}

/**
 * A fresh count, from any answer that has one: the bell and the app badge
 * follow. Nothing while signed out, so an answer that comes back after
 * signing out can't put the count back.
 */
export function setUnread(client: QueryClient, unread: number): void {
  if (!signedIn()) return;
  client.setQueryData(notificationsKeys.unread, unread);
  syncBadge(unread);
}

/** The count as last heard, without asking; null before the first answer. */
export function useUnread(): number | null {
  return useQuery({ ...unreadQuery(), enabled: false }).data ?? null;
}

/**
 * Keeps the count fresh while `on` (signed in): once now, when the page
 * shows again (if it's older than `REFOCUS_MS`), and every `POLL_MS` while
 * it's visible, never while hidden, and no more once the server says the
 * session's gone. A read in the service worker (a notification clicked)
 * sets it too. Turning off after being on (signing out) forgets
 * everything of the bell's and clears the app badge.
 */
export function useUnreadPolling(on: boolean): void {
  const client = useQueryClient();
  useQuery({
    ...unreadQuery(),
    enabled: on,
    refetchInterval: (query) =>
      unauthorized(query.state.error) ? false : POLL_MS,
  });
  const wasOn = useRef(false);
  useEffect(() => {
    if (on) {
      wasOn.current = true;
      return onReadInWorker((unread) => setUnread(client, unread));
    }
    // Before /api/me answers, `on` is false too: only a sign-out forgets.
    if (!wasOn.current) return;
    wasOn.current = false;
    syncBadge(0);
    // A call on its way would land after the reset; then forget what's
    // there and tell whatever shows it. Nothing refetches: nothing of the
    // bell's is on while signed out.
    void client
      .cancelQueries({ queryKey: notificationsKeys.all })
      .then(() => client.resetQueries({ queryKey: notificationsKeys.all }));
  }, [on, client]);
}
