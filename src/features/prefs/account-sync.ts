import { track } from "~/app/analytics";
import { useAccount } from "~/features/auth/account-store";
import { type SyncHost, startSync, stopSync } from "~/features/sync/boot";
import { runningEngine } from "~/features/sync/running";
import { useSyncStatus } from "~/features/sync/status";
import { newLocalId, nowIso } from "~/state/ids";
import { noteToast } from "~/ui/toast";
import { prefsDb } from "./save";
import { settleAccountPrefs, showSyncedPrefs } from "./synced-prefs";

// Plan sync on a page that shows none of the synced tables (Settings,
// Reviews, Chat), so the synced prefs follow the account there too. It's the
// scheduler's engine on IndexedDB, as signing out on /settings runs it
// (~/features/sync/sign-out); what it pulls lands in IndexedDB for the
// scheduler and Plan, and a change to the prefs reaches the page's copy
// (~/features/sync/boot). Loaded only with a session.

let host: SyncHost | null = null;

/** A serial write queue, for the engine's dirty flags. */
function queue(): SyncHost["persistence"] {
  let tail: Promise<unknown> = Promise.resolve();
  let stopped = false;
  return {
    enqueue: (write) => {
      if (stopped) return;
      tail = tail.then(write).catch(console.error);
    },
    flushed: async () => {
      await tail;
    },
    stop: () => {
      stopped = true;
    },
  };
}

function prefsHost(): SyncHost {
  return {
    db: prefsDb(),
    persistence: queue(),
    status: useSyncStatus,
    ids: { now: nowIso, newId: newLocalId },
    reloadAccount: () => void useAccount.getState().load(),
    toast: (title, description) =>
      noteToast(title, description ? { description } : {}),
    trackFirstSignIn: (counts) => track("sync_first_sign_in", counts),
    showPrefs: showSyncedPrefs,
    settled: settleAccountPrefs,
  };
}

/**
 * Syncs with `userId`'s account unless the page already runs plan sync (the
 * scheduler's or Plan's carries the prefs too).
 */
export function syncPrefs(userId: string): void {
  if (runningEngine()) return;
  host ??= prefsHost();
  startSync(host, userId);
}

/**
 * Stops the sync this module started, if it's the one running. The next
 * sign-in gets a fresh host: signing out may have stopped this one's queue.
 */
export function stopPrefsSync(): void {
  if (host) stopSync(host);
  host = null;
}
