import { create } from "zustand";

// Plan sync's state for the top bar and the account menu. Tiny on purpose:
// it's in the scheduler's eager bundle. The engine that sets it, and the
// icons and words that show it (view.ts), load only once someone is signed in
// (scripts/check-bundle.ts).

export type SyncStatus =
  /** Signed out, or the engine hasn't started. Nothing is shown. */
  | "off"
  | "saving"
  | "saved"
  /** No network: changes wait on this device. */
  | "offline"
  /** The server answered with an error; the engine keeps retrying. */
  | "error"
  /** The account holds SYNC_MAX_PLANS plans; new ones can't be saved. */
  | "full";

export type ShownSyncStatus = Exclude<SyncStatus, "off">;

/** How each status looks: its icon (a 24×24 stroke icon's paths), words and tooltip. */
export type SyncStatusLook = Record<
  ShownSyncStatus,
  { icon: readonly string[]; label: string; tooltip: string }
>;

export interface SyncStatusState {
  status: SyncStatus;
  /** Set by the engine's chunk when it loads. */
  look: SyncStatusLook | null;
  /** Checks with the account now; set while the engine runs. */
  syncNow: (() => void) | null;
}

export const useSyncStatus = create<SyncStatusState>()(() => ({
  status: "off",
  look: null,
  syncNow: null,
}));

export function setSyncStatus(status: SyncStatus): void {
  if (useSyncStatus.getState().status !== status)
    useSyncStatus.setState({ status });
}

/**
 * Set at every sign-out (eagerly, so it can't be missed): the next engine
 * start forgets the old sync state, so plans edited while signed out join the
 * account like a first sign-in (V2 §4.7) instead of being taken for saved.
 */
export const SYNC_RESET_KEY = "terpsicle:sync-reset";
