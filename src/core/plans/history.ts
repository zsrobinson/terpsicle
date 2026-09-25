// Undo/redo as a snapshot stack (BUILD §4): states are immutable, so each
// entry is just a reference. Not persisted (DATA §5).

export type History<S> = {
  readonly past: readonly S[];
  readonly present: S;
  readonly future: readonly S[];
};

/** How many steps back undo can go. */
export const UNDO_LIMIT = 100;

export function createHistory<S>(present: S): History<S> {
  return { past: [], present, future: [] };
}

/** Records a new present; a no-op (same object) records nothing. */
export function record<S>(
  history: History<S>,
  next: S,
  limit: number = UNDO_LIMIT,
): History<S> {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: [],
  };
}

/** Applies a reducer action and records the result. */
export function applyWithHistory<S, A>(
  history: History<S>,
  reducer: (state: S, action: A) => S,
  action: A,
): History<S> {
  return record(history, reducer(history.present, action));
}

export function canUndo<S>(history: History<S>): boolean {
  return history.past.length > 0;
}

export function canRedo<S>(history: History<S>): boolean {
  return history.future.length > 0;
}

export function undo<S>(history: History<S>): History<S> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined || !canUndo(history)) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<S>(history: History<S>): History<S> {
  const [next, ...rest] = history.future;
  if (next === undefined || !canRedo(history)) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

/**
 * Replaces the present without recording a step, e.g. when the store loads
 * from IndexedDB. Clears the history, since old steps may not apply.
 */
export function resetHistory<S>(present: S): History<S> {
  return createHistory(present);
}
