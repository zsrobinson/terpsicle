import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { TodoFeedState, TodoItem } from "~/core/schema";
import { type CombinedList, combineWeeks } from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { saveTodoTask } from "./todo-mutations";
import {
  type CachedWeek,
  cachedWeeks,
  forgetTodo,
  type RefreshNote,
  type TodoPhase,
  todoElmsQuery,
  todoKeys,
} from "./todo-queries";

// Reading Todo's server data in components: the weeks on hand as one list,
// ELMS's sync, and whether a disconnect is waiting on Undo, which hides
// ELMS everywhere until it's settled.

/** A disconnect is waiting on Undo, or on the server: ELMS shows as gone. */
export function useDisconnecting(): boolean {
  return useIsMutating({ mutationKey: todoKeys.disconnect }) > 0;
}

/** Todo's list: every week on hand, read as one. */
export interface TodoList extends CombinedList {
  /** When the newest week came from our server; null before any has. */
  listedAt: number | null;
}

function sameWeeks(a: readonly CachedWeek[], b: readonly CachedWeek[]) {
  return (
    a.length === b.length &&
    a.every((week, i) => week.list === b[i]?.list && week.at === b[i]?.at)
  );
}

/**
 * Every week the page has asked for, as one list: the week on screen, the
 * ones beside it, Home's, and any visited before. The sidebar's courses,
 * colors and hidden rows read all of it, as they read the whole list.
 * Without ELMS's items while a disconnect waits.
 */
export function useTodoList(): TodoList {
  const client = useQueryClient();
  const last = useRef<{ weeks: CachedWeek[]; list: TodoList } | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  const read = useCallback((): TodoList => {
    const weeks = cachedWeeks(client);
    if (last.current && sameWeeks(last.current.weeks, weeks))
      return last.current.list;
    const list: TodoList = {
      ...combineWeeks(weeks),
      listedAt: weeks.length > 0 ? Math.max(...weeks.map((w) => w.at)) : null,
    };
    last.current = { weeks, list };
    return list;
  }, [client]);
  const list = useSyncExternalStore(subscribe, read, read);
  const disconnecting = useDisconnecting();
  return useMemo(
    () =>
      disconnecting
        ? {
            ...list,
            items: list.items.filter((i: TodoItem) => i.source !== "elms"),
          }
        : list,
    [list, disconnecting],
  );
}

/** ELMS's sync as the bar and the connect page show it. */
export interface ElmsSyncView {
  /** Null while ELMS isn't connected (or a disconnect waits). */
  feed: TodoFeedState | null;
  /** ELMS is being asked, by opening the page or by Sync now. */
  busy: boolean;
  note: RefreshNote;
}

/** ELMS's sync, without asking (`useAskElms` asks). */
export function useElmsSync(): ElmsSyncView {
  const query = useQuery({ ...todoElmsQuery(), enabled: false });
  const syncing = useIsMutating({ mutationKey: todoKeys.sync }) > 0;
  const disconnecting = useDisconnecting();
  const busy = query.isFetching || syncing;
  return {
    feed: disconnecting ? null : (query.data?.feed ?? null),
    busy,
    note: disconnecting || busy ? null : (query.data?.note ?? null),
  };
}

/**
 * Asks ELMS again as a page that shows the list opens, once the list says
 * there's a working link and its last read is ten minutes old.
 */
export function useAskElms(on: boolean): void {
  const feed = useQuery({ ...todoElmsQuery(), enabled: false }).data?.feed;
  useQuery({
    ...todoElmsQuery(),
    enabled: on && feed != null && feed.status !== "broken",
  });
}

/** A week's query as a phase: shown once it's there, failed only with nothing to show. */
export function weekPhase(
  on: boolean,
  query: { data: unknown; isError: boolean },
): TodoPhase {
  if (!on) return "idle";
  if (query.data !== undefined) return "ready";
  return query.isError ? "failed" : "loading";
}

/**
 * Forgets Todo's data once no one is signed in, so it's not kept in memory
 * for whoever signs in next.
 */
export function useForgetTodoOnSignOut(): void {
  const client = useQueryClient();
  const signedOut = useAccount((s) => s.status === "signed-out");
  useEffect(() => {
    if (signedOut) forgetTodo(client);
  }, [signedOut, client]);
}

/** Saving an own task, from a form or a menu. */
export function useSaveTask() {
  const client = useQueryClient();
  return useCallback(
    (uid: string, fields: Parameters<typeof saveTodoTask>[2]) =>
      saveTodoTask(client, uid, fields),
    [client],
  );
}
