import { queryOptions } from "@tanstack/react-query";
import { reviewedKey } from "~/core/reviews";
import type { DeptCode, IsoDate, TermId } from "~/core/schema";
import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";

// What Home reads from the server (docs/V3.md §1.5), as TanStack Query
// factories (docs/decisions.md, "TanStack Query for server data"): the
// account's answers, then what it reads from published files.
//
// The account's answers: your rooms' unread counts, your seat watches and
// the reviews you've written. Each is one small `/api` call, asked again
// when you come back to the tab (the client's focus refetch), and tried
// once more before a part says it couldn't load. Signed-in only: the
// caller turns each on.

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

// ---------- published files ----------

// What Home reads from published files, each answer built from the files'
// own queries (./data.ts, loaded on first use, so Home's first load
// carries neither them nor the disk cache). The files keep their own
// freshness and stay saved on this device; these answers are a glance
// over them, built again when you come back to the tab once they're a
// minute old. They read the disk, so they run offline too, and they don't
// fail: what can't be read is left out.

const reads = () => import("./data");

/** Read from the disk and the server alike: never paused while offline. */
const publishedAnswer = {
  staleTime: HOME_STALE_MS,
  retry: 1,
  networkMode: "always",
} as const;

/** The academic calendars of the terms that can be Now or Next on `today`. */
export function homeCalendarsQuery(today: IsoDate) {
  return queryOptions({
    queryKey: ["home", "calendars", today],
    queryFn: async ({ client }) => (await reads()).loadCalendars(client, today),
    ...publishedAnswer,
  });
}

/** Walking distances between buildings; null without the routes file. */
export function homeCampusQuery() {
  return queryOptions({
    queryKey: ["home", "campus"],
    queryFn: async ({ client }) => (await reads()).loadCampus(client),
    ...publishedAnswer,
  });
}

/** A term's catalog for these departments (`planDepts`), with its seats and changes. */
export function planCatalogQuery(termId: TermId, depts: readonly DeptCode[]) {
  return queryOptions({
    queryKey: ["home", "plan-catalog", termId, depts],
    queryFn: async ({ client }) =>
      (await reads()).loadPlanCatalog(client, termId, depts),
    ...publishedAnswer,
  });
}

/** The course index's entries for these departments (`fourYearDepts`). */
export function fourYearCoursesQuery(depts: readonly DeptCode[]) {
  return queryOptions({
    queryKey: ["home", "four-year-courses", depts],
    queryFn: async ({ client }) =>
      (await reads()).loadFourYearCourses(client, depts),
    ...publishedAnswer,
  });
}
