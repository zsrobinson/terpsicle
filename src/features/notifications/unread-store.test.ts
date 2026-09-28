import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SW_NOTIFICATIONS_READ_MESSAGE } from "~/core/schema";
import { notificationsApi } from "~/server/fns/notifications";
import {
  POLL_MS,
  REFOCUS_MS,
  useUnread,
  useUnreadPolling,
} from "./unread-store";

vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { unread: vi.fn() },
}));

const unread = vi.mocked(notificationsApi.unread);

let visibility: DocumentVisibilityState = "visible";

/** Lets the lazy client and its answer land. */
const settle = () => act(async () => await vi.advanceTimersByTimeAsync(0));

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  unread.mockReset();
  unread.mockResolvedValue({ unread: 4 });
  useUnread.setState({ unread: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnreadPolling", () => {
  it("asks once signed in, and not at all signed out", async () => {
    const { rerender } = renderHook(({ on }) => useUnreadPolling(on), {
      initialProps: { on: false },
    });
    await settle();
    expect(unread).not.toHaveBeenCalled();
    rerender({ on: true });
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    expect(useUnread.getState().unread).toBe(4);
    // Signing out forgets the number.
    rerender({ on: false });
    expect(useUnread.getState().unread).toBeNull();
  });

  it("asks every 2 minutes while the page shows, never while it's hidden", async () => {
    renderHook(() => useUnreadPolling(true));
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

  it("asks on focus, but not twice in a row", async () => {
    renderHook(() => useUnreadPolling(true));
    await settle();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    await act(async () => await vi.advanceTimersByTimeAsync(REFOCUS_MS));
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(unread).toHaveBeenCalledTimes(2);
  });

  it("asks again at the next focus after a failure", async () => {
    unread.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useUnreadPolling(true));
    await settle();
    act(() => window.dispatchEvent(new Event("focus")));
    await settle();
    expect(unread).toHaveBeenCalledTimes(2);
    expect(useUnread.getState().unread).toBe(4);
  });

  it("hears a read in the service worker", async () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", {
      value: worker,
      configurable: true,
    });
    try {
      const { unmount } = renderHook(() => useUnreadPolling(true));
      await settle();
      act(() => {
        worker.dispatchEvent(
          new MessageEvent("message", {
            data: { type: SW_NOTIFICATIONS_READ_MESSAGE, unread: 1 },
          }),
        );
      });
      expect(useUnread.getState().unread).toBe(1);
      unmount();
    } finally {
      Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
});
