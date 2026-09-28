import { useEffect, useSyncExternalStore } from "react";
import { PREFS_STORAGE_KEY } from "~/core/prefs";
import { type SyncedPrefs, SyncedPrefsSchema } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";

// The other products' synced prefs (`SyncedPrefs`: AI features, Chat's room
// rules) on every page, cheaply (docs/V2.md §5.1, DATA.md §5).
//
// Where they live: the `prefs` settings row in IndexedDB, which plan sync
// reads and writes with the rest of the settings doc, so they're local while
// signed out and the account's once signed in. Reviews' pages never load
// IndexedDB up front (scripts/check-bundle.ts), so every page reads a
// localStorage copy instead, the way the theme works (~/app/theme). Whatever
// writes the row writes the copy: a save here (./save), and plan sync
// showing a change from the account (~/features/sync/boot).
//
// Signed in, plan sync must be running for a change to reach the account and
// for the account's to arrive. The scheduler and Plan run it for their own
// docs; any other page that reads these prefs starts it (./account-sync).

let current: SyncedPrefs | null = null;
const listeners = new Set<() => void>();

function readCopy(): SyncedPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = SyncedPrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    // Storage blocked, or a copy that doesn't read: the defaults.
    return {};
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** The prefs as this browser last saw them; the same object until they change. */
export function syncedPrefs(): SyncedPrefs {
  current ??= readCopy();
  return current;
}

/**
 * Shows prefs saved on this device or pulled from the account: keeps the
 * copy and tells every reader on the page (other tabs hear the storage event).
 */
export function showSyncedPrefs(prefs: SyncedPrefs): void {
  if (JSON.stringify(prefs) === JSON.stringify(syncedPrefs())) return;
  current = prefs;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: this page still shows them.
  }
  notify();
}

/** For `useSyncExternalStore`: a change on this page, or in another tab. */
export function subscribeSyncedPrefs(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== PREFS_STORAGE_KEY && event.key !== null) return;
    current = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Changes the prefs: shown at once, then saved to IndexedDB and, signed in,
 * sent to the account. `change` returns its input when nothing changes.
 */
export async function saveSyncedPrefs(
  change: (prefs: SyncedPrefs) => SyncedPrefs,
): Promise<void> {
  // Signed in, before plan sync's first step on this page: on a device's
  // first sign-in that step joins the account and keeps the account's value
  // for every pref both sides have, undoing this. It's made again once the
  // step is done (settleAccountPrefs), when it's marked for the account.
  if (!firstStep && useAccount.getState().status === "signed-in")
    beforeFirstStep.push(change);
  showSyncedPrefs(change(syncedPrefs()));
  try {
    const { savePrefs } = await import("./save");
    showSyncedPrefs(await savePrefs(change));
  } catch (error) {
    // IndexedDB blocked or broken: the copy holds it for this browser.
    console.error(error);
  }
  followAccountPrefs();
}

// ---------- following the account ----------

/** Pages that run plan sync themselves (the scheduler, Plan). */
let claims = 0;
let accountSync: typeof import("./account-sync") | null = null;
let following = false;

/**
 * The scheduler and Plan call this while they're up: their own plan sync
 * carries these prefs, so no second one starts beside it. Returns a release.
 */
export function claimAccountSync(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

function follow(): void {
  const { status, user } = useAccount.getState();
  if (status === "signed-out") {
    accountSync?.stopPrefsSync();
    return;
  }
  if (status !== "signed-in" || !user || claims > 0) return;
  // Loaded only with a session: signed-out visitors download none of it.
  void import("./account-sync")
    .then((module) => {
      accountSync = module;
      const now = useAccount.getState();
      if (now.status === "signed-in" && now.user?.id === user.id && !claims)
        module.syncPrefs(user.id);
    })
    .catch(console.error);
}

/**
 * Keeps these prefs following the account while someone is signed in, on
 * pages that don't run plan sync themselves. Safe to call often.
 */
export function followAccountPrefs(): void {
  if (!following) {
    following = true;
    useAccount.subscribe((next, prev) => {
      if (next.status !== prev.status || next.user?.id !== prev.user?.id)
        follow();
    });
  }
  follow();
}

/**
 * The synced prefs, following the account. Null on the server and while
 * the page hydrates, before this browser's choice can be read: a caller that
 * shows something only when a pref allows it waits for it.
 */
export function useSyncedPrefs(): SyncedPrefs | null {
  useEffect(() => followAccountPrefs(), []);
  return useSyncExternalStore(subscribeSyncedPrefs, syncedPrefs, () => null);
}

// ---------- the account's, once read ----------

/**
 * How long something that waits for the account's prefs waits at most: past
 * it, this device's are good enough (offline, or sync couldn't load).
 */
export const ACCOUNT_PREFS_WAIT_MS = 4_000;

let settled = false;
const settledListeners = new Set<() => void>();

/** Plan sync's first step on this page is done: the account's prefs are here. */
let firstStep = false;
/** Changes made signed in before it, made again after it (`saveSyncedPrefs`). */
let beforeFirstStep: ((prefs: SyncedPrefs) => SyncedPrefs)[] = [];

function settle(): void {
  if (settled) return;
  settled = true;
  for (const listener of settledListeners) listener();
}

/**
 * Plan sync's first step on this page has finished (`SyncHost.settled`).
 * Changes made while it ran are made again over what it brought, in order,
 * so they're this device's edits to the account's prefs, and go to it.
 */
export function settleAccountPrefs(): void {
  settle();
  if (firstStep) return;
  firstStep = true;
  const changes = beforeFirstStep;
  beforeFirstStep = [];
  if (changes.length > 0)
    void saveSyncedPrefs((prefs) =>
      changes.reduce((next, change) => change(next), prefs),
    );
}

function subscribeSettled(listener: () => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

/**
 * Whether the prefs shown are the account's, as far as they can be: always
 * signed out; signed in, once plan sync's first step on this page is done
 * (or ACCOUNT_PREFS_WAIT_MS has passed). For something shown once and then
 * never again, like Chat's room rules, so a new device doesn't flash it.
 */
export function useAccountPrefsSettled(): boolean {
  const status = useAccount((s) => s.status);
  const done = useSyncExternalStore(
    subscribeSettled,
    () => settled,
    () => false,
  );
  useEffect(() => {
    if (status === "signed-out" || settled) return;
    // Only the showing waits no longer: changes still wait for the step.
    const timer = setTimeout(settle, ACCOUNT_PREFS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [status]);
  return status === "signed-out" || done;
}

/** Tests start from nothing on the page. */
export function resetSyncedPrefsForTests(): void {
  current = null;
  claims = 0;
  settled = false;
  firstStep = false;
  beforeFirstStep = [];
}
