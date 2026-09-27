import type { SyncedPrefs } from "~/core/schema";
import { SETTINGS_DOC_KEY } from "~/core/sync";
import { runningEngine, syncHost } from "~/features/sync/running";
import { dexieSyncStorage, markEdited } from "~/features/sync/storage";
import { TerpsicleDb } from "~/state/db";

// Saving the synced prefs (./synced-prefs) to IndexedDB, loaded on the first
// change: Reviews' pages don't load IndexedDB up front.

let own: TerpsicleDb | null = null;

/**
 * The page's database: the one running plan sync uses, else one of our own.
 * (A stopped host's may be closed: the scheduler closes its own on leaving.)
 */
export function prefsDb(): TerpsicleDb {
  const host = runningEngine() ? syncHost() : null;
  if (host) return host.db;
  own ??= new TerpsicleDb();
  return own;
}

/**
 * Writes the change to the `prefs` row, in one step with plan sync's state:
 * on a device that syncs with an account, the settings doc is marked unsaved
 * in the same transaction, so a pull can't overwrite it before it's sent.
 * Returns the prefs as saved.
 */
export async function savePrefs(
  change: (prefs: SyncedPrefs) => SyncedPrefs,
): Promise<SyncedPrefs> {
  const storage = dexieSyncStorage(prefsDb());
  const { after } = await storage.update((s) => {
    const prefs = change(s.tables.prefs);
    if (prefs === s.tables.prefs) return s;
    const next = { ...s, tables: { ...s.tables, prefs } };
    return s.userId === null ? next : markEdited(next, [SETTINGS_DOC_KEY]);
  });
  // Pushed a second from now, if plan sync is running on this page.
  runningEngine()?.noteEditedDocs([SETTINGS_DOC_KEY]);
  return after.tables.prefs;
}

/** The prefs this device holds, to correct the page's copy. */
export async function devicePrefs(): Promise<SyncedPrefs> {
  const { tables } = await dexieSyncStorage(prefsDb()).read();
  return tables.prefs;
}
