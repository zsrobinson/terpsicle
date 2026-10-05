import {
  MutationObserver,
  type QueryClient,
  QueryClientProvider,
  QueryObserver,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS } from "~/core/schema/notifications";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser, anInboxItem } from "~/fixtures";
import { notificationsApi } from "~/server/fns/notifications";
import { createTestQueryClient } from "~/state/query/testing";
import { useMarkRead } from "./inbox";
import { inboxQuery, notificationsKeys } from "./queries";
import {
  notificationSettingsQuery,
  pushDevicesQuery,
  saveSettingsMutation,
  settingsKeys,
  useForgetSettingsOnSignOut,
} from "./settings-queries";

// The settings page's queries beside the bell's, in one client as on the
// page: neither side's changes ask for the other's data again, and signing
// out forgets the settings.

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: {
    settings: vi.fn(),
    setSettings: vi.fn(),
    devices: vi.fn(),
    inbox: vi.fn(),
    read: vi.fn(),
    unread: vi.fn(),
  },
}));
vi.mock("./this-device", () => ({
  currentEndpoint: vi.fn(async () => undefined),
}));

const api = vi.mocked(notificationsApi);
const item = anInboxItem({ id: "a" });

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
  useAccount.setState({ status: "signed-in", user: aMeUser() });
  api.settings.mockResolvedValue({ settings: DEFAULT_NOTIFICATION_SETTINGS });
  api.setSettings.mockResolvedValue({
    settings: DEFAULT_NOTIFICATION_SETTINGS,
  });
  api.devices.mockResolvedValue({ devices: [] });
  api.inbox.mockResolvedValue({ items: [item], unread: 1, next: null });
  api.unread.mockResolvedValue({ unread: 1 });
  api.read.mockResolvedValue({ unread: 0 });
});

afterEach(() => {
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

/**
 * The settings page and the bell's inbox, open together, with the count as
 * the bell last heard it. (The bell's queries load the API client on first
 * use; two loading it at the same moment can get Vitest's real module
 * rather than the mock, so only the inbox asks here.)
 */
function renderBoth() {
  client.setQueryData(notificationsKeys.unread, 1);
  return renderHook(
    () => {
      useQuery(notificationSettingsQuery());
      useQuery(pushDevicesQuery());
      useInfiniteQuery(inboxQuery());
      return { read: useMarkRead(), save: useMutation(saveSettingsMutation()) };
    },
    { wrapper },
  );
}

/** Everything the three queries asked for once. */
async function loaded() {
  for (const call of [api.settings, api.devices, api.inbox])
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
}

describe("the settings beside the bell", () => {
  it("keeps apart from the bell's keys", () => {
    for (const key of Object.values(settingsKeys))
      expect(key[0]).not.toBe(notificationsKeys.all[0]);
  });

  it("a read in the bell doesn't ask for the settings or devices again", async () => {
    const { result } = renderBoth();
    await loaded();
    act(() => result.current.read(item));
    await waitFor(() => expect(api.read).toHaveBeenCalledOnce());
    // The bell asks again for its own once the read has settled…
    await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(2));
    // …and nothing of the settings page's.
    expect(api.settings).toHaveBeenCalledOnce();
    expect(api.devices).toHaveBeenCalledOnce();
    expect(client.getQueryState(settingsKeys.settings)?.isInvalidated).toBe(
      false,
    );
  });

  it("a save leaves the bell's count and inbox alone", async () => {
    const { result } = renderBoth();
    await loaded();
    const next = { ...DEFAULT_NOTIFICATION_SETTINGS, showText: false };
    act(() => result.current.save.mutate(next));
    // Shown at once, then asked for again once it's saved.
    expect(
      client.getQueryData<{ settings: unknown }>(settingsKeys.settings)
        ?.settings,
    ).toEqual(next);
    await waitFor(() => expect(api.settings).toHaveBeenCalledTimes(2));
    expect(api.inbox).toHaveBeenCalledOnce();
    expect(api.devices).toHaveBeenCalledOnce();
    expect(client.getQueryData(notificationsKeys.unread)).toBe(1);
    for (const key of [notificationsKeys.unread, notificationsKeys.inbox])
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });
});

describe("saveSettingsMutation", () => {
  it("asks for the settings once after a run of saves", async () => {
    await client.prefetchQuery(notificationSettingsQuery());
    // Something on screen reads the settings.
    const unsubscribe = new QueryObserver(
      client,
      notificationSettingsQuery(),
    ).subscribe(() => {});
    let answer: () => void = () => {};
    const sent = new Promise<void>((resolve) => {
      answer = resolve;
    });
    api.setSettings.mockImplementation(async () => {
      await sent;
      return { settings: DEFAULT_NOTIFICATION_SETTINGS };
    });
    const save = (showText: boolean) =>
      new MutationObserver(client, saveSettingsMutation()).mutate({
        ...DEFAULT_NOTIFICATION_SETTINGS,
        showText,
      });

    const both = Promise.all([save(false), save(true)]);
    answer();
    await both;
    await waitFor(() => expect(api.settings).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.settings).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

describe("useForgetSettingsOnSignOut", () => {
  it("forgets the settings and devices once no one is signed in", async () => {
    renderHook(() => useForgetSettingsOnSignOut(), { wrapper });
    await client.prefetchQuery(notificationSettingsQuery());
    await client.prefetchQuery(pushDevicesQuery());
    client.setQueryData(notificationsKeys.unread, 1);
    expect(client.getQueryData(settingsKeys.settings)).toBeDefined();
    act(() => useAccount.setState({ status: "signed-out", user: null }));
    await waitFor(() =>
      expect(client.getQueryData(settingsKeys.settings)).toBeUndefined(),
    );
    expect(client.getQueryData(settingsKeys.devices)).toBeUndefined();
    // The bell forgets its own (./queries).
    expect(client.getQueryData(notificationsKeys.unread)).toBe(1);
  });

  it("keeps them while someone is signed in", async () => {
    await client.prefetchQuery(notificationSettingsQuery());
    renderHook(() => useForgetSettingsOnSignOut(), { wrapper });
    expect(client.getQueryData(settingsKeys.settings)).toBeDefined();
  });
});
