import { toast } from "sonner";
import type { DocKey } from "~/core/sync";
import {
  settleAccountPrefs,
  showSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import { type SyncHost, startSync, stopSync } from "~/features/sync/boot";
import { runningEngine } from "~/features/sync/running";
import { useSyncStatus } from "~/features/sync/status";
import { track } from "~/lib/analytics";
import { newLocalId, nowIso } from "~/state/ids";
import { fourYearDb } from "./data";
import { useFourYear, whenSaved } from "./store";

// Plan's side of sync (docs/V3.md §2.4): the engine the scheduler runs,
// handed Plan's store instead of the workspace. Loaded only once someone is
// signed in, like the scheduler's (scripts/check-bundle.ts). The engine
// syncs every kind of doc from IndexedDB; this page shows the four-year ones.

/**
 * Starts syncing with `userId`'s account; returns a stop. Needs the docs
 * loaded. `earlier` are docs the person changed before the engine loaded.
 */
export function startPlanSync(
  userId: string,
  reloadAccount: () => void,
  earlier: readonly DocKey[] = [],
): () => void {
  const db = fourYearDb();
  // The browser refused IndexedDB: there's nothing on this device to sync.
  if (!db) return () => {};
  const store = useFourYear;
  const host: SyncHost = {
    db,
    persistence: {
      enqueue: (write) => store.getState().enqueue(write),
      flushed: whenSaved,
      stop: () => store.getState().stopSaving(),
    },
    fourYear: {
      subscribe: (edited) =>
        store.subscribe((next, prev) => {
          const before = prev.history.present.docs;
          const after = next.history.present.docs;
          if (before !== after && next.changedBy === "person")
            edited(before, after);
        }),
      apply: (docs) => store.getState().applyRemote(docs),
      open: (id) => store.getState().setActive(id),
    },
    status: useSyncStatus,
    ids: { now: nowIso, newId: newLocalId },
    reloadAccount,
    toast: (title, description) =>
      toast(title, {
        ...(description ? { description } : {}),
        duration: 10_000,
      }),
    trackFirstSignIn: (counts) => track("sync_first_sign_in", counts),
    showPrefs: showSyncedPrefs,
    settled: settleAccountPrefs,
  };
  startSync(host, userId);
  runningEngine()?.noteEditedDocs(earlier);
  return () => stopSync(host);
}
