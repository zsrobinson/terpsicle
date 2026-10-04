import { InfiniteQueryObserver, QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem, QueueListResult } from "~/core/schema";
import type { DecisionListResult } from "~/core/schema/admin";
import type { FeedbackItem, FeedbackListResult } from "~/core/schema/feedback";
import { aFeedback } from "~/fixtures";
import { ApiCallError } from "~/server/fns/api";
import { createTestQueryClient } from "~/state/query/testing";
import {
  adminKeys,
  decisionsQuery,
  dropFeedbackItem,
  type FeedbackQuery,
  feedbackListQuery,
  gradesQuery,
  loadFailure,
  queueQuery,
  restoreFeedbackItem,
  setFeedbackItem,
  withoutQueueItem,
} from "./admin-queries";

// The admin pages' queries: what each asks for, that every look asks again
// while showing what it had, and the cache edits the pages make after a
// decision, a status change or a delete.

const anItem = (id: string): QueueItem =>
  ({ id, kind: "review", status: "open" }) as QueueItem;

const fb = (id: string, createdAt: string): FeedbackItem =>
  aFeedback({ id: id.padEnd(22, "A"), createdAt });

const page = (
  items: FeedbackItem[],
  cursor: string | null = null,
): FeedbackListResult => ({
  items,
  cursor,
  groups: [],
  hosts: ["terpsicle.com"],
  newCount: items.length,
});

let client: ReturnType<typeof createTestQueryClient>;
beforeEach(() => {
  client = createTestQueryClient();
});

describe("the admin queries", () => {
  it("asks again on every look, showing the last answer meanwhile", async () => {
    const grades = vi.fn(async () => ({ gradesThrough: null, missing: [] }));
    await client.fetchQuery(gradesQuery({ grades }));
    const observer = new QueryObserver(client, gradesQuery({ grades }));
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult()).toMatchObject({
      data: { gradesThrough: null, missing: [] },
      isFetching: true,
    });
    await vi.waitFor(() => expect(grades).toHaveBeenCalledTimes(2));
    stop();
  });

  it("keys each queue view apart, asking for open or closed posts", async () => {
    const queue = vi.fn(
      async (_input: { status?: string }): Promise<QueueListResult> => ({
        items: [],
        open: 0,
      }),
    );
    await client.fetchQuery(queueQuery({ queue }, "waiting"));
    await client.fetchQuery(queueQuery({ queue }, "decided"));
    expect(queue.mock.calls.map(([input]) => input)).toEqual([
      { status: "open", limit: 50 },
      { status: "closed", limit: 50 },
    ]);
    expect(client.getQueryData(adminKeys.queue("waiting"))).toBeDefined();
    expect(client.getQueryData(adminKeys.queue("decided"))).toBeDefined();
  });

  it("pages the decision log by its cursor, per filter", async () => {
    const decisions = vi.fn(
      async (input: { cursor?: string }): Promise<DecisionListResult> => ({
        decisions: [],
        cursor: input.cursor ? null : "next",
        days: [],
      }),
    );
    const observer = new InfiniteQueryObserver(
      client,
      decisionsQuery({ decisions }, { surface: "chat" }),
    );
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().hasNextPage).toBe(true),
    );
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    expect(decisions.mock.calls.map(([input]) => input)).toEqual([
      { surface: "chat", limit: 50 },
      { surface: "chat", cursor: "next", limit: 50 },
    ]);
    stop();
  });

  it("says why an answer failed, but not while asking again or for an older page", () => {
    const error = new ApiCallError("network");
    const failed = { isError: true, isFetching: false, error };
    expect(loadFailure(failed)).toBe(
      "Couldn't reach Terpsicle. Check your connection and try again.",
    );
    expect(loadFailure({ ...failed, isFetching: true })).toBeNull();
    expect(loadFailure({ ...failed, isFetchNextPageError: true })).toBeNull();
    expect(loadFailure({ ...failed, isError: false })).toBeNull();
  });
});

describe("withoutQueueItem", () => {
  it("drops a decided post and counts one less", () => {
    const list: QueueListResult = {
      items: [anItem("a"), anItem("b")],
      open: 5,
    };
    expect(withoutQueueItem(list, "a")).toEqual({
      items: [anItem("b")],
      open: 4,
    });
  });

  it("leaves a list without it as it was", () => {
    const list: QueueListResult = { items: [anItem("a")], open: 1 };
    expect(withoutQueueItem(list, "z")).toBe(list);
  });
});

describe("the inbox's cache edits", () => {
  const ALL: FeedbackQuery = {};
  const NEW: FeedbackQuery = { status: "new" };
  const a = fb("A", "2026-09-25T12:00:00.000Z");
  const b = fb("B", "2026-09-24T12:00:00.000Z");
  const c = fb("C", "2026-09-23T12:00:00.000Z");

  const seed = (query: FeedbackQuery, pages: FeedbackListResult[]) =>
    client.setQueryData(adminKeys.feedbackList(query), {
      pages,
      pageParams: pages.map((_, i) => (i === 0 ? null : `p${i}`)),
    });
  const items = (query: FeedbackQuery) =>
    client
      .getQueryData<{ pages: FeedbackListResult[] }>(
        adminKeys.feedbackList(query),
      )
      ?.pages.flatMap((p) => p.items.map((i) => i.id[0]));

  it("changes an item in every list that has it", () => {
    seed(ALL, [page([a, b])]);
    seed(NEW, [page([b])]);
    setFeedbackItem(client, { ...b, status: "fixed" });
    for (const query of [ALL, NEW])
      expect(
        client
          .getQueryData<{ pages: FeedbackListResult[] }>(
            adminKeys.feedbackList(query),
          )
          ?.pages.flatMap((p) => p.items)
          .find((i) => i.id === b.id)?.status,
      ).toBe("fixed");
  });

  it("drops a deleted item everywhere, and Undo puts it back by its date", () => {
    seed(ALL, [page([a, b], "p1"), page([c])]);
    seed(NEW, [page([b])]);
    dropFeedbackItem(client, b.id);
    expect(items(ALL)).toEqual(["A", "C"]);
    expect(items(NEW)).toEqual([]);
    restoreFeedbackItem(client, ALL, b);
    expect(items(ALL)).toEqual(["A", "B", "C"]);
    // Only the list it was deleted from; the other asks again on its visit.
    expect(items(NEW)).toEqual([]);
  });

  it("puts the oldest back at the end only once every page is loaded", () => {
    seed(ALL, [page([a], "p1")]);
    restoreFeedbackItem(client, ALL, c);
    expect(items(ALL)).toEqual(["A"]);
    seed(ALL, [page([a])]);
    restoreFeedbackItem(client, ALL, c);
    expect(items(ALL)).toEqual(["A", "C"]);
    restoreFeedbackItem(client, ALL, c);
    expect(items(ALL)).toEqual(["A", "C"]);
  });

  it("asks for one item by id, or the filters", async () => {
    const feedbackList = vi.fn(async () => page([a]));
    await client.fetchInfiniteQuery(
      feedbackListQuery({ feedbackList }, { id: a.id }),
    );
    expect(feedbackList).toHaveBeenCalledWith(
      { id: a.id, limit: 50 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
