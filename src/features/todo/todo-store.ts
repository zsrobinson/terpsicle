import { create } from "zustand";
import { track } from "~/app/analytics";
import type {
  IsoDate,
  TodoFeedState,
  TodoFileItem,
  TodoImportFileResult,
  TodoItem,
} from "~/core/schema";
import {
  type ConnectAnswer,
  isStale,
  listRange,
  ownTaskDue,
  ownTaskItem,
  type TaskFields,
  taskFieldsOf,
} from "~/core/todo";
import { ApiCallError } from "~/server/fns/api";
import { todoApi } from "~/server/fns/todo";

// Terpsicle Todo in the browser (docs/V3.md §3.8): the last list, in memory
// only. Nothing from Todo goes to IndexedDB or localStorage: the data is the
// server's, and a shared computer shouldn't keep a student's deadlines.
// Done marks are optimistic.

export type TodoClient = typeof todoApi;

let client: TodoClient = todoApi;

/** Test hook: a fake API client. */
export function setTodoClient(next: TodoClient): void {
  client = next;
}

export type TodoPhase = "idle" | "loading" | "ready" | "failed";

/** What the refresh control last said, if anything. */
export type RefreshNote = "too-soon" | "failed" | null;

interface Snapshot {
  feed: TodoFeedState | null;
  items: TodoItem[];
  done: ReadonlySet<string>;
}

export interface TodoState {
  phase: TodoPhase;
  /** The date the list was loaded for, New York's. */
  today: IsoDate | null;
  feed: TodoFeedState | null;
  items: TodoItem[];
  done: ReadonlySet<string>;
  refreshing: boolean;
  refreshNote: RefreshNote;
  /** Set while Disconnect's Undo is still open. */
  disconnecting: boolean;

  /** Loads the list around `today`; asks ELMS again when the last read is stale. */
  load: (today: IsoDate, now: number) => Promise<void>;
  /** Asks ELMS now (the refresh control). */
  refresh: () => Promise<void>;
  /** Marks an item done or not; false when the server didn't take it. */
  setDone: (uid: string, done: boolean) => Promise<boolean>;
  /** Connected, or what the form says instead. */
  connect: (url: string) => Promise<{ status: "connected" } | ConnectAnswer>;
  /** Shows the disconnected state now; the route runs when Undo is gone. */
  disconnect: () => void;
  undoDisconnect: () => void;
  /** Sends a pending disconnect at once (leaving the page). */
  /** Undo's time is up: delete the link and its deadlines now. */
  confirmDisconnect: () => void;
  flushDisconnect: () => void;
  importFile: (items: TodoFileItem[]) => Promise<TodoImportFileResult | null>;
  /**
   * Adds or changes an own task at once, then saves it; on a failure the
   * list goes back as it was and the answer says why.
   */
  saveTask: (
    uid: string,
    fields: TaskFields,
  ) => Promise<"saved" | "too-many" | "out-of-range" | "failed">;
  /** Takes an own task off the list at once, then deletes it; false when that failed and it's back. */
  deleteTask: (uid: string) => Promise<boolean>;
  /** Puts a deleted task back as it was, done mark and all (Undo). */
  restoreTask: (item: TodoItem, done: boolean) => Promise<boolean>;
}

let pending: { before: Snapshot } | null = null;

/** Why our own server didn't answer `todo/connect`, as far as the form can say. */
function connectCallFailure(
  error: unknown,
): "signed-out" | "rate-limited" | "failed" {
  if (!(error instanceof ApiCallError)) return "failed";
  if (error.reason === "unauthorized") return "signed-out";
  if (error.reason === "rate-limited") return "rate-limited";
  return "failed";
}

const INITIAL = {
  phase: "idle" as TodoPhase,
  today: null,
  feed: null,
  items: [],
  done: new Set<string>(),
  refreshing: false,
  refreshNote: null as RefreshNote,
  disconnecting: false,
};

export const useTodo = create<TodoState>()((set, get) => {
  const fetchList = async (today: IsoDate) => {
    const result = await client.list(listRange(today));
    // A disconnect waiting on Undo: keep showing it gone.
    if (pending) return;
    set({
      phase: "ready",
      today,
      feed: result.feed,
      items: result.items,
      done: new Set(result.done),
    });
  };

  const sendDisconnect = (keepalive: boolean) => {
    if (!pending) return;
    pending = null;
    set({ disconnecting: false });
    track("todo_disconnected", {});
    void client
      .disconnect(
        keepalive
          ? { fetcher: (url, init) => fetch(url, { ...init, keepalive: true }) }
          : undefined,
      )
      .catch(() => {
        // Nothing to show: the next load says whether it's still connected.
      });
  };

  return {
    ...INITIAL,

    load: async (today, now) => {
      if (get().phase !== "ready") set({ phase: "loading" });
      try {
        await fetchList(today);
      } catch {
        set({ phase: "failed" });
        return;
      }
      if (isStale(get().feed, now)) await get().refresh();
    },

    refresh: async () => {
      if (get().refreshing) return;
      set({ refreshing: true, refreshNote: null });
      try {
        const result = await client.refresh();
        set({
          feed: result.feed,
          refreshNote: result.status === "fetched" ? null : result.status,
        });
        const today = get().today;
        if (result.status === "fetched" && today) await fetchList(today);
      } catch {
        set({ refreshNote: "failed" });
      } finally {
        set({ refreshing: false });
      }
    },

    setDone: async (uid, done) => {
      const flip = (on: boolean) => {
        const next = new Set(get().done);
        if (on) next.add(uid);
        else next.delete(uid);
        set({ done: next });
      };
      flip(done);
      try {
        await client.done({ uid, done });
        return true;
      } catch {
        flip(!done);
        return false;
      }
    },

    connect: async (url) => {
      // A disconnect still waiting on Undo goes first, or it would delete
      // the link being connected now.
      if (pending) {
        pending = null;
        set({ disconnecting: false });
        await client.disconnect().catch(() => undefined);
      }
      try {
        const result = await client.connect({ url });
        if (result.status === "connected") {
          set({ feed: result.feed });
          const today = get().today;
          if (today) await fetchList(today).catch(() => undefined);
          return { status: "connected" };
        }
        return result;
      } catch (error) {
        return { status: connectCallFailure(error) };
      }
    },

    disconnect: () => {
      if (pending) return;
      const { feed, items, done } = get();
      // Sent by confirmDisconnect once the Undo toast is gone (it waits
      // while Undo has focus), or by flushDisconnect as the page closes.
      pending = { before: { feed, items, done } };
      set({
        feed: null,
        items: items.filter((i) => i.source !== "elms"),
        disconnecting: true,
        refreshNote: null,
      });
    },

    undoDisconnect: () => {
      if (!pending) return;
      const { before } = pending;
      pending = null;
      set({ ...before, disconnecting: false });
    },

    confirmDisconnect: () => sendDisconnect(false),

    flushDisconnect: () => sendDisconnect(true),

    importFile: async (items) => {
      try {
        const result = await client.importFile({ items });
        const today = get().today;
        if (today) await fetchList(today).catch(() => undefined);
        return result;
      } catch {
        return null;
      }
    },

    saveTask: async (uid, fields) => {
      const before = get().items.find((i) => i.uid === uid) ?? null;
      const shown = ownTaskItem({
        uid,
        title: fields.title.trim(),
        courseCode: fields.courseCode,
        ...ownTaskDue(fields.dueDate, fields.dueTime),
      });
      const put = (item: TodoItem | null) =>
        set({
          items:
            item === null
              ? get().items.filter((i) => i.uid !== uid)
              : get().items.some((i) => i.uid === uid)
                ? get().items.map((i) => (i.uid === uid ? item : i))
                : [...get().items, item],
        });
      put(shown);
      try {
        const result = await client.saveTask({ uid, ...fields });
        if (result.status !== "saved") {
          put(before);
          return result.status;
        }
        put(result.item);
        return "saved";
      } catch {
        put(before);
        return "failed";
      }
    },

    deleteTask: async (uid) => {
      const { items, done } = get();
      const index = items.findIndex((i) => i.uid === uid);
      const item = items[index];
      if (!item) return true;
      const wasDone = done.has(uid);
      const withoutMark = new Set(done);
      withoutMark.delete(uid);
      set({ items: items.filter((i) => i.uid !== uid), done: withoutMark });
      try {
        await client.deleteTask({ uid });
        return true;
      } catch {
        // Back where it was.
        const next = [...get().items];
        next.splice(Math.min(index, next.length), 0, item);
        const marks = new Set(get().done);
        if (wasDone) marks.add(uid);
        set({ items: next, done: marks });
        return false;
      }
    },

    restoreTask: async (item, done) => {
      const saved = await get().saveTask(item.uid, taskFieldsOf(item));
      if (saved !== "saved") return false;
      return done ? get().setDone(item.uid, true) : true;
    },
  };
});

/** Test hook: back to nothing loaded, with no disconnect waiting. */
export function resetTodo(): void {
  pending = null;
  useTodo.setState(INITIAL);
}
