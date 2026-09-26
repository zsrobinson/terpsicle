import type { DocKey, SyncedTables } from "~/core/sync";
import type { WorkspaceState } from "~/state/workspace-store";
import { SyncEngine, type SyncNotice } from "./engine";
import { syncToast } from "./messages";
import { engineOptions, openChannel, type SyncMessage } from "./options";
import { applyRemoteChange } from "./remote-change";
import { runningEngine, type SyncHost, setRunning } from "./running";
import type { SyncStatus } from "./status";
import { dexieSyncStorage, type SyncStorage } from "./storage";
import { SYNC_STATUS_LOOK } from "./view";

// Plan sync in the scheduler: the lazy chunk the app loads once /api/me says
// someone is signed in, so signed-out visitors download none of it. Wires
// the engine to IndexedDB, the workspace store, the page's events and the
// browser's other tabs. Everything from the scheduler comes in `SyncHost`.

export type { SyncHost } from "./running";

/** Must match SYNC_RESET_KEY in ./status (the eager side sets it). */
const SYNC_RESET_KEY = "terpsicle:sync-reset";

let current: { userId: string; host: SyncHost; teardown: () => void } | null =
  null;

function tablesOf(s: WorkspaceState): SyncedTables {
  return {
    plans: s.plans,
    blocks: s.blocks,
    colors: s.colors,
    travel: s.travel,
    chatPlans: s.chatPlans,
  };
}

function notifier(host: SyncHost) {
  return (notice: SyncNotice): void => {
    if (notice.kind === "first-sign-in" && !notice.reset)
      host.trackFirstSignIn({
        uploaded: notice.uploaded,
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

/** Starts syncing the scheduler's workspace with `userId`'s account. */
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
        applyRemoteChange(host.workspace, change);
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

  const stopEdits = host.workspace.subscribe((next, prev) => {
    if (applying || !next.hydrated || !prev.hydrated) return;
    engine.noteEdit(tablesOf(prev), tablesOf(next));
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

export function stopSync(): void {
  current?.teardown();
  current = null;
}
