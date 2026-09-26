import { RETURNING_FLAG_KEY } from "~/core/routing";
import { TerpsicleDb } from "~/state/db";
import { newLocalId, nowIso } from "~/state/ids";
import { SyncEngine } from "./engine";
import { engineOptions, openChannel, type SyncMessage } from "./options";
import { runningEngine, setRunning, syncHost } from "./running";
import { dexieSyncStorage } from "./storage";

// Plan sync's part of signing out (V2 §4.7), loaded only when someone signs
// out, on any page. "Sign out" keeps everything on the device and stops
// syncing. "Sign out and remove plans from this device" (a shared computer)
// first makes sure the account has everything, then clears the device.

/** Signing out and removing would lose changes the account doesn't have yet. */
export class UnsavedChangesError extends Error {
  constructor() {
    super("Changes on this device haven't reached the account yet");
    this.name = "UnsavedChangesError";
  }
}

/** The browser's database, when the scheduler isn't open on this page. */
function openDevice() {
  return {
    db: new TerpsicleDb(),
    ids: { now: nowIso, newId: newLocalId },
  };
}

/**
 * Before the session ends: with `removeLocal`, pushes everything (joining the
 * account first if this device never synced) and refuses if anything is left.
 */
export async function beforeSignOut(options: {
  removeLocal: boolean;
  userId: string | null;
}): Promise<void> {
  if (!options.removeLocal) return;
  const running = runningEngine();
  if (running) {
    if (!(await running.flush())) throw new UnsavedChangesError();
    return;
  }
  if (!options.userId) return;
  // Not in the scheduler (/settings): the same engine, straight on IndexedDB.
  const { db, ids } = openDevice();
  try {
    const engine = new SyncEngine({
      ...engineOptions(options.userId, dexieSyncStorage(db), ids),
      apply: () => {},
      enqueue: (write) => void write(),
      flushed: async () => {},
      notify: () => {},
      status: () => {},
      signedOut: () => {},
    });
    const saved = await engine.flush();
    engine.stop();
    if (!saved) throw new UnsavedChangesError();
  } finally {
    db.close();
  }
}

/** After the session ends: stop syncing, and clear the device if asked. */
export async function afterSignOut(options: {
  removeLocal: boolean;
}): Promise<void> {
  const host = syncHost();
  runningEngine()?.stop();
  setRunning(null);
  const channel = openChannel();
  channel?.postMessage({
    type: "signed-out",
    removedLocal: options.removeLocal,
  } satisfies SyncMessage);
  channel?.close();
  const device = host ? null : openDevice();
  const db = host?.db ?? device?.db;
  if (!db) return;
  const storage = dexieSyncStorage(db);
  try {
    if (!options.removeLocal) {
      await storage.clearSync();
      return;
    }
    // Nothing the scheduler still holds may be written back afterwards.
    if (host) {
      await host.persistence.flushed();
      host.persistence.stop();
    }
    await storage.clearAll();
    try {
      localStorage.removeItem(RETURNING_FLAG_KEY);
    } catch {
      // Storage blocked: `/` counts plans instead, and finds none.
    }
    // In the scheduler, its plans are gone from under it: start over at `/`.
    if (host) window.location.assign("/");
  } finally {
    device?.db.close();
  }
}
