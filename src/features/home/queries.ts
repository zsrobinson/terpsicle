import { queryOptions } from "@tanstack/react-query";
import { reviewedKey } from "~/core/reviews";
import type { TermId } from "~/core/schema";
import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";

// The account's answers Home reads (docs/V3.md §1.5), as TanStack Query
// factories (docs/decisions.md, "TanStack Query for server data"): your
// rooms' unread counts, your seat watches and the reviews you've written.
// Each is one small `/api` call, asked again when you come back to the tab
// (the client's focus refetch), and tried once more before a part says it
// couldn't load. Signed-in only: the caller turns each on.

/** How long an answer counts as current on Home: a glance, not a feed. */
const HOME_STALE_MS = 60_000;

/** Your rooms in a term that have messages, with their unread counts. */
export function chatRoomsQuery(termId: TermId | null) {
  return queryOptions({
    queryKey: ["home", "chat-rooms", termId],
    queryFn: async () => {
      if (termId === null) return [];
      return (await chatApi.unread({ termId })).rooms;
    },
    staleTime: HOME_STALE_MS,
    retry: 1,
  });
}

/** Your seat watches in a term; null while seat alerts are off. */
export function seatWatchesQuery(termId: TermId) {
  return queryOptions({
    queryKey: ["home", "seat-watches", termId],
    queryFn: async () => {
      const result = await api.alerts.list({ termId });
      return result.status === "ok" ? result.watches : null;
    },
    staleTime: HOME_STALE_MS,
    retry: 1,
  });
}

/** `reviewedKey`s of the reviews you've written (rejected ones don't count). */
export function reviewedKeysQuery() {
  return queryOptions({
    queryKey: ["home", "reviewed"],
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const { reviews } = await api.reviews.mine();
      return new Set(
        reviews
          .filter((r) => r.status !== "rejected")
          .map((r) => reviewedKey(r.course, r.reviewedName)),
      );
    },
    staleTime: HOME_STALE_MS,
    retry: 1,
  });
}
