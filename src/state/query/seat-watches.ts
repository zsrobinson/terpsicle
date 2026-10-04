import {
  type QueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import type { SeatWatch, SectionKey, TermId } from "~/core/schema";
import { api, retryApi } from "~/server/fns/api";

// The signed-in person's seat watches (V2.md §6.5), as the server last told
// us: what the bells, the calendar, Problems, the Watching list, Settings
// and Home read. One query over `alerts/list` (every term, newest first) is
// the only copy (docs/decisions.md, "TanStack Query for server data"); the
// server holds them, and nothing is kept on disk. Starting and stopping
// watches are mutations over it, in ~/features/alerts, which also turns
// the query on while someone is signed in and resets it on sign-out.

/** The alerts API, or a test's stand-in. */
export type SeatWatchesApi = Pick<
  typeof api.alerts,
  "watch" | "unwatch" | "list"
>;

let stub: SeatWatchesApi | null = null;

/** Test hook: a fake API client; null for the real one. */
export function setSeatWatchesApi(next: SeatWatchesApi | null): void {
  stub = next;
}

/** The alerts API, or a test's stand-in. */
export function seatWatchesApi(): SeatWatchesApi {
  return stub ?? api.alerts;
}

/** The query's key, and the key of the mutations that change it. */
export const seatWatchesKey = ["seat-watches"] as const;

/**
 * How long the list counts as current: a watch changes only here (each
 * change updates it at once) or as the term ends. Coming back to the tab
 * after this asks again.
 */
export const SEAT_WATCHES_STALE_MS = 60_000;

/** Every watch, newest first; empty while seat alerts are off. */
export function seatWatchesQuery() {
  return queryOptions({
    queryKey: seatWatchesKey,
    queryFn: async ({ signal }): Promise<readonly SeatWatch[]> => {
      const result = await seatWatchesApi().list({}, { signal });
      return result.status === "ok" ? result.watches : [];
    },
    staleTime: SEAT_WATCHES_STALE_MS,
    retry: retryApi,
  });
}

const same =
  (termId: TermId, sectionKey: SectionKey) =>
  (w: Pick<SeatWatch, "termId" | "sectionKey">) =>
    w.termId === termId && w.sectionKey === sectionKey;

export function findSeatWatch(
  watches: readonly SeatWatch[] | null | undefined,
  termId: TermId,
  sectionKey: SectionKey,
): SeatWatch | undefined {
  return watches?.find(same(termId, sectionKey));
}

/** The list with `watch` added or replaced, newest first. */
export function withSeatWatch(
  watches: readonly SeatWatch[] | undefined,
  watch: SeatWatch,
): readonly SeatWatch[] {
  return [
    watch,
    ...(watches ?? []).filter((w) => !same(watch.termId, watch.sectionKey)(w)),
  ];
}

/** The list without one section's watch (the same list if it had none). */
export function withoutSeatWatch(
  watches: readonly SeatWatch[] | undefined,
  termId: TermId,
  sectionKey: SectionKey,
): readonly SeatWatch[] | undefined {
  if (!watches?.some(same(termId, sectionKey))) return watches;
  return watches.filter((w) => !same(termId, sectionKey)(w));
}

/** The list in `client`'s cache, without asking; undefined before it loads. */
export function cachedSeatWatches(
  client: QueryClient,
): readonly SeatWatch[] | undefined {
  return client.getQueryData(seatWatchesKey);
}

/**
 * The list as last heard, without asking: null until it has loaded (and
 * when signed out). ~/features/alerts keeps it loaded while signed in.
 */
export function useSeatWatchList(): readonly SeatWatch[] | null {
  return useQuery({ ...seatWatchesQuery(), enabled: false }).data ?? null;
}

const NONE: ReadonlySet<SectionKey> = new Set();

/** The sections watched in one term (Problems, the calendar). */
export function useWatchedSections(
  termId: TermId | null,
): ReadonlySet<SectionKey> {
  const watches = useSeatWatchList();
  return useMemo(() => {
    if (!termId || !watches) return NONE;
    const keys = watches
      .filter((w) => w.termId === termId)
      .map((w) => w.sectionKey);
    return keys.length > 0 ? new Set(keys) : NONE;
  }, [termId, watches]);
}
