import { type QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoListResult } from "~/core/schema";
import { combineWeeks, type WeekList } from "~/core/todo";
import { anOwnTask, aTodoFeedState, aTodoItem } from "~/fixtures";
import { createTestQueryClient } from "~/state/query/testing";
import {
  confirmDisconnect,
  connectElms,
  deleteTodoTask,
  disconnectElms,
  hideTodoCourse,
  resetTodoMutations,
  saveTodoTask,
  setTodoDone,
  undoDisconnect,
} from "./todo-mutations";
import {
  cachedFeed,
  cachedWeeks,
  type ElmsSync,
  setTodoClient,
  type TodoClient,
  todoKeys,
  todoWeekQuery,
} from "./todo-queries";

// Todo's changes over the week queries (docs/V3.md §3.8): each shows at
// once wherever the item is, and a failure takes back only its own change.

const MON = "2026-09-28";
const NEXT = "2026-10-05";

const project = aTodoItem({ uid: "project", dueDate: "2026-09-29" });
const quiz = aTodoItem({ uid: "quiz", dueDate: "2026-10-01" });
const later = aTodoItem({ uid: "later", dueDate: "2026-10-06" });
const task = anOwnTask({ uid: "own-undated-00001", title: "Email Dr. Kim" });

/** A promise the test settles. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fakeClient(answer: Partial<TodoListResult> = {}) {
  const client = {
    list: vi.fn(async () => ({
      feed: aTodoFeedState(),
      items: [project, quiz, later, task],
      done: [],
      hidden: [],
      ...answer,
    })),
    done: vi.fn(async () => ({ status: "ok" as const })),
    hideCourse: vi.fn(async () => ({ status: "ok" as const })),
    saveTask: vi.fn(),
    deleteTask: vi.fn(async () => ({ status: "ok" as const })),
    disconnect: vi.fn(async () => ({ status: "disconnected" as const })),
    connect: vi.fn(),
    refresh: vi.fn(),
    importFile: vi.fn(),
  };
  setTodoClient(client as unknown as TodoClient);
  return client;
}

let queries: QueryClient;

/** This week and next, read once. */
async function twoWeeks() {
  await queries.fetchQuery(todoWeekQuery(MON));
  await queries.fetchQuery(todoWeekQuery(NEXT));
}

const list = () => combineWeeks(cachedWeeks(queries));
const week = (first: string) =>
  queries.getQueryData<WeekList>(todoKeys.week(first));

beforeEach(() => {
  queries = createTestQueryClient();
  resetTodoMutations();
});

afterEach(() => {
  setTodoClient(null);
});

describe("checking items off", () => {
  it("shows at once, and comes back off when the server says no", async () => {
    const client = fakeClient();
    await twoWeeks();
    const answer = deferred<{ status: "ok" }>();
    client.done.mockReturnValueOnce(answer.promise);
    const saving = setTodoDone(queries, "project", true);
    expect(list().done.has("project")).toBe(true);
    answer.reject(new Error("offline"));
    expect(await saving).toBe(false);
    expect(list().done.has("project")).toBe(false);
  });

  it("takes back only its own check: one saved meanwhile stays", async () => {
    const client = fakeClient();
    await twoWeeks();
    const first = deferred<{ status: "ok" }>();
    client.done.mockReturnValueOnce(first.promise);
    const failing = setTodoDone(queries, "project", true);
    const saved = setTodoDone(queries, "quiz", true);
    expect(await saved).toBe(true);
    first.reject(new Error("offline"));
    expect(await failing).toBe(false);
    expect([...list().done]).toEqual(["quiz"]);
  });

  it("marks an undated task in every week, which each list it", async () => {
    fakeClient();
    await twoWeeks();
    await setTodoDone(queries, task.uid, true);
    expect(week(MON)?.done).toContain(task.uid);
    expect(week(NEXT)?.done).toContain(task.uid);
  });

  it("asks for the weeks on screen again once the last change settles", async () => {
    const client = fakeClient();
    await twoWeeks();
    const asked = client.list.mock.calls.length;
    // Something on screen reads this week.
    const unwatch = new QueryObserver(queries, todoWeekQuery(MON)).subscribe(
      () => {},
    );
    await Promise.all([
      setTodoDone(queries, "project", true),
      setTodoDone(queries, "quiz", true),
    ]);
    await vi.waitFor(() =>
      expect(client.list.mock.calls.length).toBeGreaterThan(asked),
    );
    unwatch();
  });
});

describe("hiding a course", () => {
  it("hides it in every week at once, and shows it again on a failure", async () => {
    const client = fakeClient();
    await twoWeeks();
    client.hideCourse.mockRejectedValueOnce(new Error("offline"));
    const hiding = hideTodoCourse(queries, "CMSC216", true);
    expect(week(MON)?.hidden).toEqual(["CMSC216"]);
    expect(week(NEXT)?.hidden).toEqual(["CMSC216"]);
    expect(await hiding).toBe(false);
    expect(list().hidden.size).toBe(0);
  });
});

describe("your own tasks", () => {
  it("moves a task to its new week at once, and back when it didn't save", async () => {
    const client = fakeClient({
      items: [project, anOwnTask({ uid: "own-dated-000001", dueDate: MON })],
      done: ["own-dated-000001"],
    });
    await twoWeeks();
    const answer = deferred<unknown>();
    client.saveTask.mockReturnValueOnce(answer.promise);
    const saving = saveTodoTask(queries, "own-dated-000001", {
      title: "Lab report",
      courseCode: null,
      dueDate: "2026-10-07",
      dueTime: null,
    });
    expect(week(MON)?.items.map((i) => i.uid)).toEqual(["project"]);
    expect(week(NEXT)?.items.map((i) => i.title)).toEqual(["Lab report"]);
    // The done mark goes with it.
    expect(week(NEXT)?.done).toEqual(["own-dated-000001"]);
    answer.resolve({ status: "out-of-range" });
    expect(await saving).toBe("out-of-range");
    expect(week(NEXT)?.items).toEqual([]);
    expect(week(MON)?.items.map((i) => i.uid)).toEqual([
      "project",
      "own-dated-000001",
    ]);
    expect(week(MON)?.done).toEqual(["own-dated-000001"]);
  });

  it("puts the server's copy in place once saved", async () => {
    const client = fakeClient({ items: [] });
    await twoWeeks();
    const saved = anOwnTask({ uid: "own-new-00000001", title: "Read ch. 4" });
    client.saveTask.mockResolvedValueOnce({ status: "saved", item: saved });
    expect(
      await saveTodoTask(queries, saved.uid, {
        title: " Read ch. 4 ",
        courseCode: null,
        dueDate: null,
        dueTime: null,
      }),
    ).toBe("saved");
    expect(week(MON)?.items).toEqual([saved]);
    expect(week(NEXT)?.items).toEqual([saved]);
  });

  it("deletes a task with its mark at once, and puts both back on a failure", async () => {
    const client = fakeClient({ done: [task.uid] });
    await twoWeeks();
    client.deleteTask.mockRejectedValueOnce(new Error("offline"));
    const deleting = deleteTodoTask(queries, task.uid);
    expect(list().items.some((i) => i.uid === task.uid)).toBe(false);
    expect(await deleting).toBe(false);
    expect(week(MON)?.items).toContainEqual(task);
    expect(week(NEXT)?.done).toEqual([task.uid]);
  });
});

describe("ELMS", () => {
  it("is what the newest answer said", async () => {
    fakeClient({ feed: aTodoFeedState({ status: "broken" }) });
    await twoWeeks();
    expect(cachedFeed(queries)?.status).toBe("broken");
  });

  it("disconnects once Undo's time is up, and takes ELMS's items off every week", async () => {
    const client = fakeClient();
    await twoWeeks();
    disconnectElms(queries);
    expect(client.disconnect).not.toHaveBeenCalled();
    confirmDisconnect();
    await vi.waitFor(() =>
      expect(queries.getQueryData<ElmsSync>(todoKeys.elms)?.feed).toBeNull(),
    );
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(list().items).toEqual([task]);
  });

  it("sends nothing on Undo", async () => {
    const client = fakeClient();
    await twoWeeks();
    disconnectElms(queries);
    undoDisconnect();
    await vi.waitFor(() => expect(queries.isMutating()).toBe(0));
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(cachedFeed(queries)).not.toBeNull();
  });

  it("sends a waiting disconnect before connecting a new link", async () => {
    const client = fakeClient();
    client.connect.mockResolvedValueOnce({
      status: "connected",
      feed: aTodoFeedState(),
      items: [],
    });
    await twoWeeks();
    disconnectElms(queries);
    expect(await connectElms(queries, "https://elms.umd.edu/x")).toEqual({
      status: "connected",
    });
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(client.disconnect.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      client.connect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(cachedFeed(queries)).not.toBeNull();
    confirmDisconnect();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
