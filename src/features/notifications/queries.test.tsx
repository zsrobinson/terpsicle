import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SW_NOTIFICATIONS_READ_MESSAGE } from "~/core/schema";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser } from "~/fixtures";
import { ApiCallError } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { createTestQueryClient } from "~/state/query/testing";
import {
  notificationsKeys,
  POLL_MS,
  REFOCUS_MS,
  setUnread,
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

const badge = {
  setAppBadge: vi.fn(async (_count: number) => {}),
  clearAppBadge: vi.fn(async () => {}),
};

const signIn = () =>
  useAccount.setState({ status: "signed-in", user: aMeUser() });
const signOut = () => useAccount.setState({ status: "signed-out", user: null });

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
  badge.setAppBadge.mockClear();
  badge.clearAppBadge.mockClear();
  Object.assign(navigator, badge);
  signIn();
});

afterEach(() => {
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUnreadPolling", () => {
  it("asks once signed in, and not at all before", async () => {
    signOut();
    const view = renderBell(false);
    await settle();
    expect(unread).not.toHaveBeenCalled();
    // Nothing's forgotten before /api/me answers: the badge stays as it was.
    expect(badge.clearAppBadge).not.toHaveBeenCalled();
    signIn();
    view.rerender({ on: true });
    await settle();
    expect(unread).toHaveBeenCalledTimes(1);
    expect(view.result.current).toBe(4);
    expect(badge.setAppBadge).toHaveBeenLastCalledWith(4);
  });

  it("forgets the count and clears the badge on signing out, and a late answer can't bring it back", async () => {
    const view = renderBell();
    await settle();
    expect(view.result.current).toBe(4);

    signOut();
    view.rerender({ on: false });
    await settle();
    expect(view.result.current).toBeNull();
    expect(badge.clearAppBadge).toHaveBeenCalledTimes(1);

    // A read that answers after signing out.
    setUnread(client, 3);
    await settle();
    expect(view.result.current).toBeNull();

    // Signing in again shows nothing until the new answer comes.
    let answer: (value: { unread: number }) => void = () => {};
    unread.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    signIn();
    view.rerender({ on: true });
    await settle();
    expect(view.result.current).toBeNull();
    answer({ unread: 1 });
    await settle();
    expect(view.result.current).toBe(1);
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

  it("doesn't ask again when the server said no, and stops polling once the session's gone", async () => {
    unread.mockRejectedValue(new ApiCallError("unauthorized"));
    renderBell();
    await failed();
    expect(unread).toHaveBeenCalledTimes(1);
    await act(async () => await vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(unread).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through a dropped connection", async () => {
    unread.mockRejectedValue(new ApiCallError("network"));
    renderBell();
    await failed();
    unread.mockResolvedValue({ unread: 2 });
    await act(async () => await vi.advanceTimersByTimeAsync(POLL_MS));
    await settle();
    expect(client.getQueryData(notificationsKeys.unread)).toBe(2);
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
