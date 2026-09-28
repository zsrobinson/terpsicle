import {
  type InfiniteData,
  type QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InboxItem,
  NotificationsInboxResult,
} from "~/core/schema/notifications";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser, anInboxItem } from "~/fixtures";
import { notificationsApi } from "~/server/fns/notifications";
import { createTestQueryClient } from "~/state/query/testing";
import { useMarkRead } from "./inbox";
import { inboxQuery, notificationsKeys } from "./queries";

// Reads through the query cache (the seam between the list, the count and
// the server): shown at once, put back on failure, and never an older
// answer over a newer one.

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { inbox: vi.fn(), read: vi.fn(), unread: vi.fn() },
}));

const api = vi.mocked(notificationsApi);
type Pages = InfiniteData<NotificationsInboxResult>;

const a = anInboxItem({ id: "a" });
const b = anInboxItem({ id: "b", title: "Jo in MATH140" });

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

/** A promise and the hands that settle it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** The list and count as the bell last had them: two unread. */
function seed() {
  client.setQueryData<Pages>(notificationsKeys.inbox, {
    pages: [{ items: [a, b], unread: 2, next: null }],
    pageParams: [null],
  });
  client.setQueryData(notificationsKeys.unread, 2);
}

const count = () => client.getQueryData<number>(notificationsKeys.unread);
const readIds = () =>
  (client.getQueryData<Pages>(notificationsKeys.inbox)?.pages ?? [])
    .flatMap((p) => p.items)
    .filter((i: InboxItem) => i.readAt !== null)
    .map((i) => i.id);

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
  useAccount.setState({ status: "signed-in", user: aMeUser() });
  api.unread.mockResolvedValue({ unread: 0 });
});

afterEach(() => {
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

describe("useMarkRead", () => {
  it("shows a read at once, and puts it back when it fails", async () => {
    seed();
    const failure = deferred<{ unread: number }>();
    api.read.mockReturnValueOnce(failure.promise);
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => result.current(a));
    await waitFor(() => expect(count()).toBe(1));
    expect(readIds()).toEqual(["a"]);

    await act(async () => failure.reject(new Error("offline")));
    await waitFor(() => expect(count()).toBe(2));
    expect(readIds()).toEqual([]);
  });

  it("doesn't undo a newer read when an older one fails", async () => {
    seed();
    const first = deferred<{ unread: number }>();
    api.read
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ unread: 0 });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => result.current(a));
    await waitFor(() => expect(count()).toBe(1));
    act(() => result.current(b));
    await waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(count()).toBe(0));

    await act(async () => first.reject(new Error("offline")));
    // Settled: asked again, and still what the newer read left.
    await waitFor(() =>
      expect(client.getQueryState(notificationsKeys.unread)?.isInvalidated),
    );
    expect(count()).toBe(0);
    expect(readIds().sort()).toEqual(["a", "b"]);
  });

  it("never takes an older answer's count over a newer one", async () => {
    seed();
    const first = deferred<{ unread: number }>();
    api.read
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ unread: 0 });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    act(() => result.current(a));
    await waitFor(() => expect(count()).toBe(1));
    act(() => result.current(b));
    await waitFor(() => expect(count()).toBe(0));

    // The first read's answer, from before the second was made.
    await act(async () => first.resolve({ unread: 1 }));
    await waitFor(() =>
      expect(client.getQueryState(notificationsKeys.unread)?.isInvalidated),
    );
    expect(count()).toBe(0);
  });

  it("asks for the list and count again once a read has settled", async () => {
    api.inbox.mockResolvedValue({ items: [a, b], unread: 2, next: null });
    api.read.mockResolvedValue({ unread: 1 });
    const { result } = renderHook(
      () => {
        useInfiniteQuery(inboxQuery());
        return useMarkRead();
      },
      { wrapper },
    );
    await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readIds()).toEqual([]));
    api.inbox.mockResolvedValue({
      items: [{ ...a, readAt: "2026-09-28T12:00:00.000Z" }, b],
      unread: 1,
      next: null,
    });
    act(() => result.current(a));
    await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(count()).toBe(1));
    expect(readIds()).toEqual(["a"]);
  });

  it("leaves a list that's loading for the first time to land", async () => {
    const first = deferred<NotificationsInboxResult>();
    api.inbox.mockReturnValueOnce(first.promise);
    api.inbox.mockResolvedValue({ items: [a, b], unread: 0, next: null });
    api.read.mockResolvedValue({ unread: 0 });
    client.setQueryData(notificationsKeys.unread, 2);
    const { result } = renderHook(
      () => ({ list: useInfiniteQuery(inboxQuery()), read: useMarkRead() }),
      { wrapper },
    );
    await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(1));
    // "Mark all read" while the list is still a skeleton.
    act(() => result.current.read());
    await waitFor(() => expect(api.read).toHaveBeenCalledWith({ all: true }));
    await act(async () =>
      first.resolve({ items: [a, b], unread: 2, next: null }),
    );
    await waitFor(() => expect(result.current.list.data).toBeDefined());
    expect(result.current.list.isPending).toBe(false);
  });
});
