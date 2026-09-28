import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SW_NOTIFICATIONS_READ_MESSAGE } from "~/core/schema";
import { ApiCallError } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { createTestQueryClient } from "~/state/query/testing";
import {
  notificationsKeys,
  POLL_MS,
  REFOCUS_MS,
  useUnread,
  useUnreadPolling,
} from "./queries";

// The bell's count through the query cache: the poll, focus, failures, the
// service worker's reads, and signing out.

vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { unread: vi.fn() },
}));

const unread = vi.mocked(notificationsApi.unread);

let visibility: DocumentVisibilityState = "visible";
let client: QueryClient;

/** Lets the lazy client and its answer land. */
const settle = () => act(async () => await vi.advanceTimersByTimeAsync(0));

/** Waits (moving the fake clock) until the count's query has given up. */
const failed = () =>
  vi.waitFor(() =>
    expect(client.getQueryState(notificationsKeys.unread)?.status).toBe(
      "error",
    ),
  );

/** The page shows again, as the browser says it. */
const shown = () =>
  act(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });

/** The bell's hooks as the bar uses them: poll while `on`, read the count. */
function renderBell(on = true) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    ({ on }: { on: boolean }) => {
      useUnreadPolling(on);
      return useUnread();
    },
    { wrapper, initialProps: { on } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  unread.mockReset();
  unread.mockResolvedValue({ unread: 4 });
  client = createTestQueryClient();
});

afterEach(() => {
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnreadPolling", () => {
  it("asks once signed in, and not at all signed out", async () => {
    const view = renderBell(false);
    await settle();
    expect(unread).not.toHaveBeenCalled();
    view.rerender({ on: true });
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe(4);
    // Signing out forgets the number, and everything else of the bell's.
    client.setQueryData(notificationsKeys.inbox, { pages: [], pageParams: [] });
    view.rerender({ on: false });
    await settle();
    expect(view.result.current).toBeNull();
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: notificationsKeys.all })
        .map((q) => q.state.data),
    ).toEqual([undefined, undefined]);
    expect(unread).toHaveBeenCalledTimes(1);
  });

  it("asks every 2 minutes while the page shows, never while it's hidden", async () => {
    renderBell();
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    await act(async () => await vi.advanceTimersByTimeAsync(POLL_MS - 1));
    expect(unread).toHaveBeenCalledTimes(1);
    await act(async () => await vi.advanceTimersByTimeAsync(1));
    expect(unread).toHaveBeenCalledTimes(2);
    visibility = "hidden";
    await act(async () => await vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(unread).toHaveBeenCalledTimes(2);
  });

  it("asks when the page shows again, but not right after an answer", async () => {
    renderBell();
    await settle();
    shown();
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    await act(async () => await vi.advanceTimersByTimeAsync(REFOCUS_MS));
    shown();
    await settle();
    expect(unread).toHaveBeenCalledTimes(2);
  });

  it("asks again when the page shows after a failure", async () => {
    unread.mockRejectedValueOnce(new Error("offline"));
    const view = renderBell();
    await settle();
    expect(view.result.current).toBeNull();
    shown();
    await settle();
    expect(unread).toHaveBeenCalledTimes(2);
    expect(view.result.current).toBe(4);
  });

  it("tries a dropped connection twice more", async () => {
    unread.mockRejectedValue(new ApiCallError("network"));
    renderBell();
    await failed();
    expect(unread).toHaveBeenCalledTimes(3);
  });

  it("doesn't ask again when the server said no", async () => {
    unread.mockRejectedValue(new ApiCallError("unauthorized"));
    renderBell();
    await failed();
    expect(unread).toHaveBeenCalledTimes(1);
  });

  it("hears a read in the service worker", async () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", {
      value: worker,
      configurable: true,
    });
    try {
      const view = renderBell();
      await settle();
      act(() => {
        worker.dispatchEvent(
          new MessageEvent("message", {
            data: { type: SW_NOTIFICATIONS_READ_MESSAGE, unread: 1 },
          }),
        );
      });
      await settle();
      expect(view.result.current).toBe(1);
      view.unmount();
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});
