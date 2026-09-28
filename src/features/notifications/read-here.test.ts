import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser } from "~/fixtures";
import { notificationsApi } from "~/server/fns/notifications";
import { createTestQueryClient } from "~/state/query/testing";
import { syncBadge } from "./badge";
import { notificationsKeys } from "./queries";
import { forgetReads, readOnce, useReadDayNotifications } from "./read-here";

vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { read: vi.fn() },
}));

const badge = {
  setAppBadge: vi.fn(async (_count: number) => {}),
  clearAppBadge: vi.fn(async () => {}),
};

let client: QueryClient;

beforeEach(() => {
  client = createTestQueryClient();
  forgetReads();
  vi.mocked(notificationsApi.read).mockReset();
  vi.mocked(notificationsApi.read).mockResolvedValue({ unread: 3 });
  badge.setAppBadge.mockClear();
  badge.clearAppBadge.mockClear();
  Object.assign(navigator, badge);
});

afterEach(() => {
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

describe("readOnce", () => {
  it("reads, then sets the bell and the app badge to what's left", async () => {
    await readOnce({ day: "2026-09-29" }, client, 0);
    expect(notificationsApi.read).toHaveBeenCalledWith({ day: "2026-09-29" });
    expect(badge.setAppBadge).toHaveBeenCalledWith(3);
    expect(client.getQueryData(notificationsKeys.unread)).toBe(3);
  });

  it("reads the same place at most once a minute, and again after a failure", async () => {
    await readOnce({ day: "2026-09-29" }, client, 0);
    await readOnce({ day: "2026-09-29" }, client, 59_000);
    expect(notificationsApi.read).toHaveBeenCalledTimes(1);
    await readOnce({ day: "2026-09-30" }, client, 59_000);
    await readOnce({ day: "2026-09-29" }, client, 60_000);
    expect(notificationsApi.read).toHaveBeenCalledTimes(3);

    vi.mocked(notificationsApi.read).mockRejectedValueOnce(
      new Error("offline"),
    );
    await readOnce({ day: "2026-10-01" }, client, 0);
    await readOnce({ day: "2026-10-01" }, client, 1_000);
    expect(notificationsApi.read).toHaveBeenCalledTimes(5);
  });
});

describe("syncBadge", () => {
  it("clears the badge at 0, and is quiet where it's refused", () => {
    syncBadge(0);
    expect(badge.clearAppBadge).toHaveBeenCalled();
    badge.setAppBadge.mockRejectedValueOnce(new Error("not installed"));
    expect(() => syncBadge(2)).not.toThrow();
  });
});

describe("useReadDayNotifications", () => {
  it("reads Todo's day signed in, and nothing signed out or without a day", async () => {
    const { rerender } = renderHook(
      ({ day }: { day: string | undefined }) => useReadDayNotifications(day),
      {
        initialProps: { day: "2026-09-29" as string | undefined },
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
    expect(notificationsApi.read).not.toHaveBeenCalled();
    useAccount.setState({ status: "signed-in", user: aMeUser() });
    rerender({ day: undefined });
    rerender({ day: "2026-09-29" });
    await waitFor(() =>
      expect(notificationsApi.read).toHaveBeenCalledWith({
        day: "2026-09-29",
      }),
    );
    expect(notificationsApi.read).toHaveBeenCalledTimes(1);
  });
});
