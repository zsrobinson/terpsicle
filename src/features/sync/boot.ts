import {
  changedFourYearKeys,
  type DocKey,
  type SyncedTables,
} from "~/core/sync";
import type { WorkspaceState } from "~/state/workspace-store";
import { SyncEngine, type SyncNotice } from "./engine";
import { syncToast } from "./messages";
import { engineOptions, openChannel, type SyncMessage } from "./options";
import { applyRemoteChange } from "./remote-change";
import { runningEngine, type SyncHost, setRunning } from "./running";
import type { SyncStatus } from "./status";
import { dexieSyncStorage, type SyncStorage } from "./storage";
import { SYNC_STATUS_LOOK } from "./view";

// Plan sync on a page: the lazy chunk the scheduler (and Plan, for its
// four-year docs) loads once /api/me says someone is signed in, so signed-out
// visitors download none of it. Wires the engine to IndexedDB, the page's
// store, the page's events and the browser's other tabs. Everything from the
// page comes in `SyncHost`.

export type { SyncHost } from "./running";

/** Must match SYNC_RESET_KEY in ./status (the eager side sets it). */
const SYNC_RESET_KEY = "terpsicle:sync-reset";

let current: { userId: string; host: SyncHost; teardown: () => void } | null =
  null;

/** The scheduler doesn't hold four-year docs: sync leaves them to IndexedDB. */
const NO_FOUR_YEAR = [] as const;

function tablesOf(s: WorkspaceState): SyncedTables {
  return {
    plans: s.plans,
    blocks: s.blocks,
    colors: s.colors,
    travel: s.travel,
    chatPlans: s.chatPlans,
    fourYear: NO_FOUR_YEAR,
  };
}

function notifier(host: SyncHost) {
  return (notice: SyncNotice): void => {
    if (notice.kind === "first-sign-in" && !notice.reset)
      // Counts only, plans and four-year plans together: never names or grades.
      host.trackFirstSignIn({
        uploaded: notice.uploaded + notice.fourYear.uploaded,
        renamed: notice.renamed.length,
        copies: notice.copies.length,
      });
    const message = syncToast(notice);
    if (message) host.toast(message.title, message.description);
  };
}

/** Forgets the sync state if a sign-out asked for it (SYNC_RESET_KEY). */
async function resetIfSignedOut(storage: SyncStorage): Promise<void> {
  let asked = false;
  try {
    asked = localStorage.getItem(SYNC_RESET_KEY) !== null;
  } catch {
    // Storage blocked: the sign-out's own clear covers it.
  }
  if (!asked) return;
  await storage.clearSync();
  try {
    localStorage.removeItem(SYNC_RESET_KEY);
  } catch {
    // As above.
  }
}

/** Starts syncing the page's store (the scheduler's or Plan's) with `userId`'s account. */
export function startSync(host: SyncHost, userId: string): void {
  if (current?.userId === userId && current.host === host) return;
  stopSync();

  const storage = dexieSyncStorage(host.db);
  const channel = openChannel();
  const setStatus = (status: SyncStatus) => {
    if (host.status.getState().status !== status)
      host.status.setState({ status });
  };
  let applying = false;
  const engine = new SyncEngine({
    ...engineOptions(userId, storage, host.ids),
    apply: (change) => {
      applying = true;
      try {
        if (host.workspace) applyRemoteChange(host.workspace, change);
        else if (change.fourYear?.length) host.fourYear.apply(change.fourYear);
      } finally {
        applying = false;
      }
    },
    enqueue: host.persistence.enqueue,
    flushed: host.persistence.flushed,
    notify: notifier(host),
    status: setStatus,
    signedOut: () => {
      stopSync();
      void storage.clearSync().catch(console.error);
      host.reloadAccount();
    },
    changed: (keys) =>
      channel?.postMessage({
        type: "changed",
        keys: [...keys],
      } satisfies SyncMessage),
    isVisible: () => document.visibilityState === "visible",
  });

  const stopEdits = host.workspace
    ? host.workspace.subscribe((next, prev) => {
        if (applying || !next.hydrated || !prev.hydrated) return;
        engine.noteEdit(tablesOf(prev), tablesOf(next));
      })
    : host.fourYear.subscribe((prev, next) => {
        if (applying) return;
        engine.noteEditedDocs(changedFourYearKeys(prev, next));
      });
  const onVisible = () => {
    if (document.visibilityState === "visible") void engine.sync();
  };
  const onNetwork = () => void engine.sync();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("online", onNetwork);
  window.addEventListener("offline", onNetwork);
  if (channel)
    channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      const message = event.data;
      if (message.type === "changed")
        void engine.reload(message.keys as DocKey[]);
      // This browser's plans are gone: nothing here should write them back.
      else if (message.removedLocal) window.location.assign("/");
      else host.reloadAccount();
    };

  host.status.setState({
    look: SYNC_STATUS_LOOK,
    syncNow: () => void engine.sync(),
  });
  setRunning(engine, host);
  current = {
    userId,
    host,
    teardown: () => {
      stopEdits();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      channel?.close();
      engine.stop();
      host.status.setState({ syncNow: null });
      if (runningEngine() === engine) setRunning(null);
    },
  };
  void resetIfSignedOut(storage)
    .catch(console.error)
    .then(() => {
      if (runningEngine() === engine) return engine.start();
    });
}

/** Stops syncing; with `host`, only if that page's engine is the one running. */
export function stopSync(host?: SyncHost): void {
  if (host && current?.host !== host) return;
  current?.teardown();
  current = null;
}
