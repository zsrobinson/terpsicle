import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCalloutDismissed } from "~/core/home";
import { PREFS_STORAGE_KEY } from "~/core/prefs";
import { SETTINGS_DOC_KEY } from "~/core/sync";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser } from "~/fixtures";
import { stopPrefsSync, syncPrefs } from "./account-sync";
import { prefsDb } from "./save";
import {
  ACCOUNT_PREFS_WAIT_MS,
  claimAccountSync,
  followAccountPrefs,
  resetSyncedPrefsForTests,
  saveSyncedPrefs,
  settleAccountPrefs,
  showSyncedPrefs,
  syncedPrefs,
  useAccountPrefsSettled,
} from "./synced-prefs";

// The synced prefs on a page (docs/V2.md §5.1): saved to the `prefs` row and
// the page's copy, marked for the account on a device that syncs, and
// followed from the account while someone is signed in.

vi.mock("./account-sync", () => ({
  syncPrefs: vi.fn(),
  stopPrefsSync: vi.fn(),
}));

const db = prefsDb();

beforeEach(async () => {
  localStorage.clear();
  resetSyncedPrefsForTests();
  await Promise.all([db.settings.clear(), db.syncDocs.clear()]);
  useAccount.setState({ status: "loading", user: null, flags: FLAGS_OFF });
  vi.mocked(syncPrefs).mockClear();
  vi.mocked(stopPrefsSync).mockClear();
});

describe("saving the prefs", () => {
  it("are empty, so everything's on, until someone changes one", () => {
    expect(syncedPrefs()).toEqual({});
  });

  it("keeps them in the prefs row and the page's copy, signed out", async () => {
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    expect(syncedPrefs()).toEqual({ home: { dismissed: ["plan"] } });
    expect((await db.settings.get("prefs"))?.value).toEqual({
      home: { dismissed: ["plan"] },
    });
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "")).toEqual({
      home: { dismissed: ["plan"] },
    });
    // Nothing to send: this device doesn't sync with an account.
    expect(await db.syncDocs.get(SETTINGS_DOC_KEY)).toBeUndefined();
  });

  it("keeps the other prefs this device holds, known or not", async () => {
    const theirs = {
      chatRules: { seen: ["CMSC351"] },
      later: { view: "week" },
    };
    await db.settings.put({ key: "prefs", value: theirs });
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    expect(syncedPrefs()).toEqual({ ...theirs, home: { dismissed: ["plan"] } });
  });

  it("marks the settings doc unsaved on a device that syncs with an account", async () => {
    await db.settings.put({
      key: "sync",
      value: { userId: "tstudent", cursor: 4 },
    });
    await db.syncDocs.put({
      key: SETTINGS_DOC_KEY,
      rev: 3,
      dirty: false,
      inFlight: false,
      base: null,
    });
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    expect(await db.syncDocs.get(SETTINGS_DOC_KEY)).toMatchObject({
      rev: 3,
      dirty: true,
    });
  });
});

describe("a change while the account's prefs are on their way", () => {
  // A device's first sign-in: plan sync hasn't joined the account yet, so
  // the sync row has no user and a change isn't marked for the account. The
  // join keeps the account's value for every pref both sides have
  // (`firstSignInUnion`), which would undo a change made on this page, signed
  // in, a second earlier.
  const signedIn = () =>
    useAccount.setState({
      status: "signed-in",
      user: aMeUser({ id: "tstudent" }),
    });

  /** What plan sync's first step does on this device: the account's prefs, then settled. */
  async function joinAccount(prefs: Record<string, unknown>) {
    await db.settings.put({
      key: "sync",
      value: { userId: "tstudent", cursor: 1 },
    });
    await db.syncDocs.put({
      key: SETTINGS_DOC_KEY,
      rev: 2,
      dirty: false,
      inFlight: false,
      base: null,
    });
    await db.settings.put({ key: "prefs", value: prefs });
    showSyncedPrefs(prefs);
    settleAccountPrefs();
  }

  it("keeps the change, and marks it for the account, once the join lands", async () => {
    signedIn();
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    await joinAccount({
      home: { dismissed: [] },
      chatRules: { seen: ["CMSC131"] },
    });
    await vi.waitFor(async () => {
      expect(syncedPrefs()).toEqual({
        home: { dismissed: ["plan"] },
        chatRules: { seen: ["CMSC131"] },
      });
      expect((await db.settings.get("prefs"))?.value).toEqual({
        home: { dismissed: ["plan"] },
        chatRules: { seen: ["CMSC131"] },
      });
      expect(await db.syncDocs.get(SETTINGS_DOC_KEY)).toMatchObject({
        dirty: true,
      });
    });
  });

  it("lets the account's win for a change made signed out", async () => {
    useAccount.setState({ status: "signed-out", user: null });
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    signedIn();
    await joinAccount({ home: { dismissed: [] } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncedPrefs()).toEqual({ home: { dismissed: [] } });
  });

  it("doesn't replay a change made after the join", async () => {
    signedIn();
    await joinAccount({ home: { dismissed: [] } });
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", true));
    await saveSyncedPrefs((p) => withCalloutDismissed(p, "plan", false));
    showSyncedPrefs({ home: { dismissed: [] } });
    settleAccountPrefs();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncedPrefs()).toEqual({ home: { dismissed: [] } });
  });
});

describe("following the account", () => {
  it("starts plan sync for the prefs once signed in, and stops on sign-out", async () => {
    followAccountPrefs();
    expect(syncPrefs).not.toHaveBeenCalled();
    useAccount.setState({
      status: "signed-in",
      user: aMeUser({ id: "tstudent" }),
    });
    await vi.waitFor(() => expect(syncPrefs).toHaveBeenCalledWith("tstudent"));
    useAccount.setState({ status: "signed-out", user: null });
    expect(stopPrefsSync).toHaveBeenCalled();
  });

  it("leaves it to a page that runs plan sync itself", async () => {
    const release = claimAccountSync();
    useAccount.setState({
      status: "signed-in",
      user: aMeUser({ id: "tstudent" }),
    });
    followAccountPrefs();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncPrefs).not.toHaveBeenCalled();
    release();
  });

  it("says when the account's prefs are in, so a new device doesn't flash what's closed", () => {
    vi.useFakeTimers();
    try {
      useAccount.setState({ status: "signed-out", user: null });
      const signedOut = renderHook(() => useAccountPrefsSettled());
      expect(signedOut.result.current).toBe(true);
      signedOut.unmount();

      act(() => useAccount.setState({ status: "signed-in", user: aMeUser() }));
      const { result } = renderHook(() => useAccountPrefsSettled());
      expect(result.current).toBe(false);
      // Plan sync's first step on the page.
      act(() => settleAccountPrefs());
      expect(result.current).toBe(true);

      // And if sync never answers, this device's are good enough.
      resetSyncedPrefsForTests();
      const late = renderHook(() => useAccountPrefsSettled());
      expect(late.result.current).toBe(false);
      act(() => vi.advanceTimersByTime(ACCOUNT_PREFS_WAIT_MS));
      expect(late.result.current).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
