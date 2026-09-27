import type { History } from "../plans/history";
import type { LocalId } from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import { sameJson } from "../sync/equal";
import type { FourYearState } from "./reducer";

// Four-year docs that come from the account (sync, V3 §2.4), not from the
// person: a pulled doc, a conflict's result, the first sign-in's union. They
// aren't undoable, and undo must not bring back what they replaced, so every
// step of the history gets the same change, and steps that only touched a
// replaced doc disappear (the scheduler's `rebaseHistory`).

/** Docs the account replaced, added (at the end) or removed (`null`). */
export type RemoteFourYearDocs = readonly (readonly [
  LocalId,
  FourYearDoc | null,
])[];

/** One state with the account's docs in it; the same object when nothing changes. */
export function withRemoteDocs(
  state: FourYearState,
  changes: RemoteFourYearDocs,
): FourYearState {
  let docs = state.docs;
  for (const [id, doc] of changes) {
    const i = docs.findIndex((d) => d.id === id);
    const current = docs[i];
    if (current === undefined) {
      if (doc !== null) docs = [...docs, doc];
    } else if (doc === null) docs = docs.filter((d) => d.id !== id);
    else if (!sameJson(current, doc))
      docs = docs.map((d, k) => (k === i ? doc : d));
  }
  return docs === state.docs ? state : { docs };
}

/**
 * The history with the account's docs applied to every step. A step that no
 * longer changes anything (all it did was replaced) is dropped. `moved` hears
 * each step that became a new object, so the caller can carry what it keeps
 * about it (the undo toast's label).
 */
export function rebaseFourYearHistory(
  history: History<FourYearState>,
  changes: RemoteFourYearDocs,
  moved: (from: FourYearState, to: FourYearState) => void = () => {},
): History<FourYearState> {
  const map = (s: FourYearState) => {
    const next = withRemoteDocs(s, changes);
    if (next !== s) moved(s, next);
    return next;
  };
  const present = map(history.present);
  // The account's docs join at the end of a step, so a step can differ from
  // the next only in order: that's no step either.
  const byId = (s: FourYearState) =>
    [...s.docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const same = (a: FourYearState, b: FourYearState) =>
    a === b || sameJson(byId(a), byId(b));
  // Undo goes from each step to the one before it: a step equal to what
  // follows it would undo nothing.
  const pastMapped = history.past.map(map);
  const past = pastMapped.filter((s, i) => {
    const after = pastMapped[i + 1] ?? present;
    return !same(s, after);
  });
  // Redo goes forward from the present: a step equal to what precedes it
  // would redo nothing.
  const future: FourYearState[] = [];
  for (const s of history.future.map(map)) {
    const before = future.at(-1) ?? present;
    if (!same(s, before)) future.push(s);
  }
  if (
    present === history.present &&
    past.length === history.past.length &&
    future.length === history.future.length &&
    past.every((s, i) => s === history.past[i]) &&
    future.every((s, i) => s === history.future[i])
  )
    return history;
  return { past, present, future };
}
