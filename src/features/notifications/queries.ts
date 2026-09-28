import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { retryApi } from "~/lib/query-client";
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
 * A count this fresh isn't asked for again on focus (focus and visibility
 * come together, and every answer with a count refreshes it).
 */
export const REFOCUS_MS = 15_000;

/** The unread count: the bell's number and the app badge. */
export function unreadQuery() {
  return queryOptions({
    queryKey: notificationsKeys.unread,
    queryFn: async ({ signal }) => {
      const { unread } = await (await notificationsApi()).unread({ signal });
      syncBadge(unread);
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

/** A fresh count, from any answer that has one: the bell and the app badge follow. */
export function setUnread(client: QueryClient, unread: number): void {
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
 * it's visible, never while hidden. A read in the service worker (a
 * notification clicked) sets it too. Turning off (signing out) forgets
 * everything of the bell's.
 */
export function useUnreadPolling(on: boolean): void {
  const client = useQueryClient();
  useQuery({ ...unreadQuery(), enabled: on, refetchInterval: POLL_MS });
  useEffect(() => {
    if (!on) {
      // Forgets what's there and tells whatever shows it; nothing refetches,
      // since nothing of the bell's is on while signed out.
      void client.resetQueries({ queryKey: notificationsKeys.all });
      return;
    }
    return onReadInWorker((unread) => setUnread(client, unread));
  }, [on, client]);
}
