import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aTodoFeedState, aTodoItem } from "~/fixtures";
import {
  DISCONNECT_UNDO_MS,
  resetTodo,
  setTodoClient,
  type TodoClient,
  useTodo,
} from "./todo-store";

// The store's timing and optimism (docs/V3.md §3.2, §3.8), apart from the page.

const FILE_ITEM = aTodoItem({ uid: "file-1", source: "file" });

function fakeClient() {
  const client = {
    list: vi.fn(async () => ({
      feed: aTodoFeedState({ lastSuccessAt: new Date().toISOString() }),
      items: [aTodoItem(), FILE_ITEM],
      done: [],
    })),
    connect: vi.fn(async () => ({ status: "invalid-link" as const })),
    disconnect: vi.fn(async () => ({ status: "disconnected" as const })),
    done: vi.fn(async () => ({ status: "ok" as const })),
    refresh: vi.fn(async () => ({ status: "fetched" as const, feed: null })),
    importFile: vi.fn(),
  };
  setTodoClient(client as unknown as TodoClient);
  return client;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T16:00:00.000Z"));
  resetTodo();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("disconnect", () => {
  it("hides ELMS at once, keeps file items, and deletes after Undo's time", async () => {
    const client = fakeClient();
    await useTodo.getState().load("2026-09-25", Date.now());
    useTodo.getState().disconnect();
    expect(useTodo.getState().feed).toBeNull();
    expect(useTodo.getState().items).toEqual([FILE_ITEM]);
    vi.advanceTimersByTime(DISCONNECT_UNDO_MS - 1);
    expect(client.disconnect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(useTodo.getState().disconnecting).toBe(false);
  });

  it("puts everything back on Undo and never calls the route", async () => {
    const client = fakeClient();
    await useTodo.getState().load("2026-09-25", Date.now());
    const before = useTodo.getState().items;
    useTodo.getState().disconnect();
    useTodo.getState().undoDisconnect();
    expect(useTodo.getState().feed).not.toBeNull();
    expect(useTodo.getState().items).toBe(before);
    vi.advanceTimersByTime(DISCONNECT_UNDO_MS * 2);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("sends a waiting disconnect before connecting a new link", async () => {
    const client = fakeClient();
    await useTodo.getState().load("2026-09-25", Date.now());
    useTodo.getState().disconnect();
    await useTodo.getState().connect("https://elms.umd.edu/x");
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.disconnect.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      client.connect.mock.invocationCallOrder[0] ?? 0,
    );
    vi.advanceTimersByTime(DISCONNECT_UNDO_MS);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps a list that loads meanwhile from bringing ELMS back", async () => {
    fakeClient();
    await useTodo.getState().load("2026-09-25", Date.now());
    useTodo.getState().disconnect();
    await useTodo.getState().load("2026-09-25", Date.now());
    expect(useTodo.getState().feed).toBeNull();
  });
});

describe("done marks", () => {
  it("are optimistic, and undone when the server says no", async () => {
    const client = fakeClient();
    await useTodo.getState().load("2026-09-25", Date.now());
    const uid = aTodoItem().uid;
    client.done.mockRejectedValueOnce(new Error("offline"));
    const saving = useTodo.getState().setDone(uid, true);
    expect(useTodo.getState().done.has(uid)).toBe(true);
    expect(await saving).toBe(false);
    expect(useTodo.getState().done.has(uid)).toBe(false);
    expect(await useTodo.getState().setDone(uid, true)).toBe(true);
    expect(useTodo.getState().done.has(uid)).toBe(true);
  });
});

describe("load", () => {
  it("says so when the list can't load", async () => {
    const client = fakeClient();
    client.list.mockRejectedValueOnce(new Error("offline"));
    await useTodo.getState().load("2026-09-25", Date.now());
    expect(useTodo.getState().phase).toBe("failed");
  });

  it("asks ELMS again when the last read is stale, then reloads", async () => {
    const client = fakeClient();
    client.list.mockResolvedValueOnce({
      feed: aTodoFeedState({ lastSuccessAt: "2026-09-25T12:00:00.000Z" }),
      items: [],
      done: [],
    });
    await useTodo.getState().load("2026-09-25", Date.now());
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(client.list).toHaveBeenCalledTimes(2);
    expect(client.list).toHaveBeenCalledWith({
      from: "2026-09-11",
      to: "2027-01-08",
    });
  });
});
