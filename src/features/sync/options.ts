import type { IsoDateTime, LocalId } from "~/core/schema";
import { api } from "~/server/fns/api";
import type { SyncEngineOptions } from "./engine";
import type { SyncStorage } from "./storage";

// What every engine on this device shares, the scheduler's and sign-out's
// alike. Kept apart from boot.ts so signing out elsewhere (/settings) loads
// no scheduler state (scripts/check-bundle.ts).

/** The Web Lock every tab's sync steps share. */
export const SYNC_LOCK = "terpsicle:sync";
/** Tabs tell each other about docs they changed from the account, and sign-outs. */
export const SYNC_CHANNEL = "terpsicle:sync";

export type SyncMessage =
  | { type: "changed"; keys: string[] }
  | { type: "signed-out"; removedLocal: boolean };

/** The clock and ids (`~/state/ids`), handed in by whoever starts an engine. */
export interface SyncIds {
  now: () => IsoDateTime;
  newId: () => LocalId;
}

/** Runs a step while no other tab runs one (Web Locks; one tab at a time without them). */
export function withSyncLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(SYNC_LOCK, task) : task();
}

export function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(SYNC_CHANNEL);
}

/** The engine's options for this browser; the rest is up to the caller. */
export function engineOptions(
  userId: string,
  storage: SyncStorage,
  ids: SyncIds,
): Pick<
  SyncEngineOptions,
  "userId" | "client" | "storage" | "lock" | "now" | "newId" | "isOnline"
> {
  return {
    userId,
    client: {
      push: (input) => api.sync.push(input),
      pull: (input) => api.sync.pull(input),
    },
    storage,
    lock: withSyncLock,
    now: ids.now,
    newId: ids.newId,
    isOnline: () => navigator.onLine,
  };
}
