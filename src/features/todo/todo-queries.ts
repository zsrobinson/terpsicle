import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { addDays } from "~/core/ics/dates";
import type { IsoDate, TodoFeedState } from "~/core/schema";
import {
  TODO_OPEN_REFRESH_MS,
  type WeekList,
  weekList,
  weekStartOf,
} from "~/core/todo";
import { retryApi } from "~/server/fns/api";
import { todoApi } from "~/server/fns/todo";

// Terpsicle Todo's server data (docs/V3.md §3.8) as TanStack Query
// (docs/decisions.md, "TanStack Query for server data and its caching"):
// the list a week at a time, one query per week that /todo and Home both
// read, and ELMS's sync as a query of its own. Changes are mutations over
// them (./todo-mutations). Nothing from Todo is persisted: the data is the
// server's, and a shared computer shouldn't keep a student's deadlines.

/** The routes, or a test's stand-in. */
export type TodoClient = typeof todoApi;

let stub: TodoClient | null = null;

/** Test hook: a fake API client; null for the real one. */
export function setTodoClient(next: TodoClient | null): void {
  stub = next;
}

/** Todo's routes, or a test's stand-in. */
export function todoClient(): TodoClient {
  return stub ?? todoApi;
}

/** How a part that shows the list is doing. */
export type TodoPhase = "idle" | "loading" | "ready" | "failed";

/** What ELMS said to the last ask, when it wasn't "fetched". */
export type RefreshNote = "too-soon" | "failed" | null;

export const todoKeys = {
  /** Everything here: what signing out forgets. */
  all: ["todo"] as const,
  weeks: ["todo", "week"] as const,
  week: (first: IsoDate) => ["todo", "week", first] as const,
  elms: ["todo", "elms"] as const,
  /**
   * Every change to the list. The weeks are asked for again once the last
   * of a run has settled.
   */
  edit: ["todo", "edit"] as const,
  done: ["todo", "edit", "done"] as const,
  hide: ["todo", "edit", "hide"] as const,
  task: ["todo", "edit", "task"] as const,
  file: ["todo", "edit", "file"] as const,
  connect: ["todo", "edit", "connect"] as const,
  /** Pending while Disconnect's Undo is open, and until the server's answered. */
  disconnect: ["todo", "edit", "disconnect"] as const,
  /** Sync now. */
  sync: ["todo", "sync"] as const,
};

/**
 * How long a week counts as current: it changes here (each change shows at
 * once), by ELMS (its own query reads it again), or on another device.
 * Coming back to a week, or to the tab, after this asks again.
 */
export const TODO_WEEK_STALE_MS = 60_000;

/** ELMS's side of the sync, as last heard. */
export interface ElmsSync {
  /** Null until ELMS is connected. */
  feed: TodoFeedState | null;
  /** What the last ask said, when ELMS didn't give anything new. */
  note: RefreshNote;
}

/**
 * Each answer for a week says how ELMS is: that's the sync query's data,
 * current as of ELMS's last read (or this page's last ask, if later), so
 * the query asks ELMS again only once that's ten minutes old.
 */
function noteFeed(client: QueryClient, feed: TodoFeedState | null): void {
  const before = client.getQueryState<ElmsSync>(todoKeys.elms);
  const read = feed?.lastSuccessAt ? Date.parse(feed.lastSuccessAt) : 0;
  client.setQueryData<ElmsSync>(
    todoKeys.elms,
    { feed, note: before?.data?.note ?? null },
    { updatedAt: Math.max(read, before?.dataUpdatedAt ?? 0) },
  );
}

/**
 * The week `anchor` is in, Monday to Sunday: its items, your undated
 * tasks, their done marks and the courses you hid. Kept for the page's
 * life (the sidebar's courses and colors read every week on hand), and
 * forgotten on signing out.
 */
export function todoWeekQuery(anchor: IsoDate) {
  const first = weekStartOf(anchor);
  return queryOptions({
    queryKey: todoKeys.week(first),
    queryFn: async ({ client, signal }): Promise<WeekList> => {
      const answer = await todoClient().list(
        { from: first, to: addDays(first, 6) },
        { signal },
      );
      noteFeed(client, answer.feed);
      return weekList(first, answer);
    },
    staleTime: TODO_WEEK_STALE_MS,
    gcTime: Number.POSITIVE_INFINITY,
    retry: retryApi,
  });
}

/**
 * ELMS's sync: filled in by every week's answer, and asked again (`todo/
 * refresh`) when a page that shows the list opens and ELMS's last read is
 * over ten minutes old. When ELMS had something new, the weeks are read
 * again before it settles. Not on focus or reconnecting: only as a page
 * opens, and with Sync now. A call that fails says so (`note`), and isn't
 * retried until then.
 */
export function todoElmsQuery() {
  return queryOptions({
    queryKey: todoKeys.elms,
    // No signal: the server reads ELMS either way, and the answer's worth having.
    queryFn: async ({ client }): Promise<ElmsSync> => {
      try {
        const result = await todoClient().refresh();
        if (result.status === "fetched")
          await client.invalidateQueries({ queryKey: todoKeys.weeks });
        return {
          feed: result.feed,
          note: result.status === "fetched" ? null : result.status,
        };
      } catch {
        return { feed: cachedFeed(client), note: "failed" };
      }
    },
    staleTime: TODO_OPEN_REFRESH_MS,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** ELMS's feed as last heard, without asking. */
export function cachedFeed(client: QueryClient): TodoFeedState | null {
  return client.getQueryData<ElmsSync>(todoKeys.elms)?.feed ?? null;
}

/** One week on hand: its Monday, its list, and when that came. */
export interface CachedWeek {
  first: IsoDate;
  list: WeekList;
  at: number;
}

/** Every week the cache has an answer for, in the cache's order. */
export function cachedWeeks(client: QueryClient): CachedWeek[] {
  return client
    .getQueryCache()
    .findAll({ queryKey: todoKeys.weeks })
    .flatMap((query) => {
      const first = query.queryKey[2];
      const list = query.state.data as WeekList | undefined;
      return typeof first === "string" && list
        ? [{ first, list, at: query.state.dataUpdatedAt }]
        : [];
    });
}

/**
 * Changes every week on hand where `edit` changes it, keeping when each
 * week came: a change isn't a read, so "Up to date" and staleness stay.
 */
export function editWeeks(
  client: QueryClient,
  edit: (list: WeekList, first: IsoDate) => WeekList,
): void {
  for (const { first, list, at } of cachedWeeks(client)) {
    const next = edit(list, first);
    if (next !== list)
      client.setQueryData(todoKeys.week(first), next, { updatedAt: at });
  }
}

/** Forgets all of Todo's data (signing out). */
export function forgetTodo(client: QueryClient): void {
  client.removeQueries({ queryKey: todoKeys.all });
}
