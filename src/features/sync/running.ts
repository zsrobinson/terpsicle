import type { TerpsicleDb } from "~/state/db";
import type { Persistence } from "~/state/persist";
import type { SyncEngine } from "./engine";
import type { SyncIds } from "./options";
import type { WorkspaceStore } from "./remote-change";
import type { SyncStatusState } from "./status";

// The scheduler's running engine, if this page has one, for signing out.
// Types only from the scheduler: plan sync's chunks load lazily and import
// none of its modules, which the scheduler hands in instead (a module both
// sides imported would be split out of the scheduler's first load).

/** What the scheduler hands plan sync. */
export interface SyncHost {
  db: TerpsicleDb;
  persistence: Persistence;
  /** `useWorkspace`. */
  workspace: WorkspaceStore;
  /** `useSyncStatus`. */
  status: {
    getState: () => SyncStatusState;
    setState: (partial: Partial<SyncStatusState>) => void;
  };
  ids: SyncIds;
  /** Asks /api/me again (the session ended, or another tab signed out). */
  reloadAccount: () => void;
  toast: (title: string, description?: string) => void;
  /** Counts the first sign-in's union (`sync_first_sign_in`). */
  trackFirstSignIn: (counts: {
    uploaded: number;
    renamed: number;
    copies: number;
  }) => void;
}

let engine: SyncEngine | null = null;
let host: SyncHost | null = null;

export function setRunning(next: SyncEngine | null, from?: SyncHost): void {
  engine = next;
  if (from) host = from;
}

/** The running engine, if the scheduler has one going. */
export function runningEngine(): SyncEngine | null {
  return engine;
}

/** What the scheduler handed over, once it has started sync on this page. */
export function syncHost(): SyncHost | null {
  return host;
}
