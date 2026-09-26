import type { Rev } from "../schema";
import type { DocKey } from "./docs";

// Each doc's sync flags on this device. There's no op log: a dirty doc is
// pushed whole, with the rev it was based on, whenever the device is online.
// The reducer only tracks flags; the tables change through `./docs` and
// `./conflict`.

export interface DocSync {
  /** The server rev this device's version is based on; 0 = never saved. */
  readonly rev: Rev;
  /** Changed here since the last push started. */
  readonly dirty: boolean;
  /** A push is on its way and hasn't been answered. */
  readonly inFlight: boolean;
}

export interface PlanSyncState {
  /** Pull everything with a rev above this. */
  readonly cursor: Rev;
  readonly docs: Readonly<Partial<Record<DocKey, DocSync>>>;
}

export const INITIAL_PLAN_SYNC_STATE: PlanSyncState = { cursor: 0, docs: {} };

const NEW_DOC: DocSync = { rev: 0, dirty: false, inFlight: false };

export type PlanSyncEvent =
  /** The person changed these docs (`changedDocKeys`). */
  | { type: "edited"; keys: readonly DocKey[] }
  /** These docs were sent; edits from now on make them dirty again. */
  | { type: "push-started"; keys: readonly DocKey[] }
  /** The server saved the doc at `rev`. */
  | { type: "push-accepted"; key: DocKey; rev: Rev }
  /** No answer (offline, error, or the page closed mid-push): send again later. */
  | { type: "push-failed"; keys: readonly DocKey[] }
  /**
   * The server's rev had moved; the conflict is resolved (`resolvePlanConflict`,
   * `mergeSettings`) and the device now builds on the server's `rev`.
   * `pushAgain` when the result still differs from the server's version;
   * `copy` names the new plan a keep-both made, which is pushed as new.
   */
  | {
      type: "push-conflict";
      key: DocKey;
      rev: Rev;
      pushAgain: boolean;
      copy?: DocKey;
    }
  /** A pull returned these docs, and the cursor to pull from next. */
  | {
      type: "pulled";
      docs: readonly { key: DocKey; rev: Rev }[];
      cursor: Rev;
    };

function patch(
  state: PlanSyncState,
  changes: readonly [DocKey, DocSync][],
): PlanSyncState {
  let docs = state.docs;
  for (const [key, next] of changes) {
    const current = docs[key];
    if (
      current &&
      current.rev === next.rev &&
      current.dirty === next.dirty &&
      current.inFlight === next.inFlight
    )
      continue;
    docs = { ...docs, [key]: next };
  }
  return docs === state.docs ? state : { ...state, docs };
}

function doc(state: PlanSyncState, key: DocKey): DocSync {
  return state.docs[key] ?? NEW_DOC;
}

/**
 * Whether a pulled doc should replace this device's version: only when the
 * device has nothing unsaved in it and the doc is newer. A dirty doc is left
 * for its push, whose compare-and-swap will report the conflict.
 */
export function shouldApplyPulled(
  state: PlanSyncState,
  key: DocKey,
  rev: Rev,
): boolean {
  const current = state.docs[key];
  if (!current) return true;
  return !current.dirty && !current.inFlight && rev > current.rev;
}

/** Docs to push now: dirty and not already on their way. */
export function docsToPush(state: PlanSyncState): DocKey[] {
  return (Object.keys(state.docs) as DocKey[]).filter(
    (key) => state.docs[key]?.dirty === true && !state.docs[key].inFlight,
  );
}

/** Docs whose push hasn't been answered; after a reload, pass them to `push-failed`. */
export function docsInFlight(state: PlanSyncState): DocKey[] {
  return (Object.keys(state.docs) as DocKey[]).filter(
    (key) => state.docs[key]?.inFlight === true,
  );
}

/** The rev to send as a push's base. */
export function baseRev(state: PlanSyncState, key: DocKey): Rev {
  return doc(state, key).rev;
}

/** Whether anything here hasn't reached the server yet (e.g. to warn before signing out). */
export function hasUnsaved(state: PlanSyncState): boolean {
  return Object.values(state.docs).some((d) => d?.dirty || d?.inFlight);
}

export function planSyncReducer(
  state: PlanSyncState,
  event: PlanSyncEvent,
): PlanSyncState {
  switch (event.type) {
    case "edited":
      return patch(
        state,
        event.keys.map((key) => [key, { ...doc(state, key), dirty: true }]),
      );
    case "push-started":
      return patch(
        state,
        event.keys.flatMap((key) => {
          const d = doc(state, key);
          return d.dirty && !d.inFlight
            ? [[key, { ...d, dirty: false, inFlight: true }]]
            : [];
        }),
      );
    case "push-accepted": {
      const d = doc(state, event.key);
      // An edit made while the push was out stays dirty, now based on `rev`.
      return patch(state, [
        [
          event.key,
          { rev: Math.max(d.rev, event.rev), dirty: d.dirty, inFlight: false },
        ],
      ]);
    }
    case "push-failed":
      return patch(
        state,
        event.keys.flatMap((key) => {
          const d = doc(state, key);
          return d.inFlight
            ? [[key, { ...d, dirty: true, inFlight: false }]]
            : [];
        }),
      );
    case "push-conflict": {
      const changes: [DocKey, DocSync][] = [
        [
          event.key,
          { rev: event.rev, dirty: event.pushAgain, inFlight: false },
        ],
      ];
      if (event.copy)
        changes.push([event.copy, { rev: 0, dirty: true, inFlight: false }]);
      return patch(state, changes);
    }
    case "pulled": {
      const next = patch(
        state,
        event.docs.flatMap(({ key, rev }) =>
          shouldApplyPulled(state, key, rev)
            ? [[key, { rev, dirty: false, inFlight: false }]]
            : [],
        ),
      );
      return event.cursor > next.cursor
        ? { ...next, cursor: event.cursor }
        : next;
    }
  }
}
