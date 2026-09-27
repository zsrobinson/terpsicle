import type { LocalId } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import type { TerpsicleDb } from "~/state/db";
import type { Persistence } from "~/state/persist";
import type { SyncEngine } from "./engine";
import type { SyncIds } from "./options";
import type { WorkspaceStore } from "./remote-change";
import type { SyncStatusState } from "./status";

// The page's running engine (the scheduler's or Plan's), if it has one, for
// signing out. Types only from the pages: plan sync's chunks load lazily and
// import none of their modules, which the page hands in instead (a module
// both sides imported would be split out of the page's first load).

/** What a page hands plan sync: the scheduler, or Plan (`/plan`). */
interface SyncHostBase {
  db: TerpsicleDb;
  persistence: Persistence;
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

/**
 * Plan's four-year docs in memory (`useFourYear`), as sync sees them. The
 * page's other synced tables (plans, blocks, settings) aren't loaded there:
 * sync keeps them in IndexedDB, where the scheduler reads them.
 */
export interface FourYearView {
  /** Calls `edited` with the docs before and after each change the person makes. */
  subscribe: (
    edited: (
      prev: readonly FourYearDoc[],
      next: readonly FourYearDoc[],
    ) => void,
  ) => () => void;
  /** Shows docs from the account: not undoable, and undo never brings back what they replaced. */
  apply: (docs: readonly (readonly [LocalId, FourYearDoc | null])[]) => void;
  /** Opens one of them, and remembers it as the open one (`setActive`). */
  open: (id: LocalId) => void;
}

export type SyncHost = SyncHostBase &
  (
    | {
        /** The scheduler's `useWorkspace`. */
        workspace: WorkspaceStore;
        fourYear?: undefined;
      }
    | { fourYear: FourYearView; workspace?: undefined }
  );

let engine: SyncEngine | null = null;
let host: SyncHost | null = null;

export function setRunning(next: SyncEngine | null, from?: SyncHost): void {
  engine = next;
  if (from) host = from;
}

/** The running engine, if the page has one going. */
export function runningEngine(): SyncEngine | null {
  return engine;
}

/** What the page handed over, once it has started sync. */
export function syncHost(): SyncHost | null {
  return host;
}
