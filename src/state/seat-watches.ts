import { useMemo } from "react";
import { create } from "zustand";
import type { SeatWatch, SectionKey, TermId } from "~/core/schema";

// The signed-in person's seat watches (V2.md §6.5), as the server last told
// us: what the bells, the calendar, Problems and the Watching list read.
// The server holds them; nothing is kept in the browser. Talking to the
// server lives in src/features/alerts.

export interface SeatWatchesState {
  /** Null until the list has loaded for this account (and when signed out). */
  watches: readonly SeatWatch[] | null;

  /** Replaces the list (a load, or signing out with null). */
  setAll: (watches: readonly SeatWatch[] | null) => void;
  /** Adds or replaces one, newest first. */
  put: (watch: SeatWatch) => void;
  remove: (termId: TermId, sectionKey: SectionKey) => void;
}

export const INITIAL_SEAT_WATCHES_STATE = {
  watches: null,
} satisfies Partial<SeatWatchesState>;

const same =
  (termId: TermId, sectionKey: SectionKey) =>
  (w: Pick<SeatWatch, "termId" | "sectionKey">) =>
    w.termId === termId && w.sectionKey === sectionKey;

export const useSeatWatches = create<SeatWatchesState>()((set, get) => ({
  ...INITIAL_SEAT_WATCHES_STATE,
  setAll: (watches) => set({ watches }),
  put: (watch) => {
    const rest = (get().watches ?? []).filter(
      (w) => !same(watch.termId, watch.sectionKey)(w),
    );
    set({ watches: [watch, ...rest] });
  },
  remove: (termId, sectionKey) => {
    const current = get().watches;
    if (!current?.some(same(termId, sectionKey))) return;
    set({ watches: current.filter((w) => !same(termId, sectionKey)(w)) });
  },
}));

export function findSeatWatch(
  watches: readonly SeatWatch[] | null,
  termId: TermId,
  sectionKey: SectionKey,
): SeatWatch | undefined {
  return watches?.find(same(termId, sectionKey));
}

const NONE: ReadonlySet<SectionKey> = new Set();

/** The sections watched in one term (Problems, the calendar). */
export function useWatchedSections(
  termId: TermId | null,
): ReadonlySet<SectionKey> {
  const watches = useSeatWatches((s) => s.watches);
  return useMemo(() => {
    if (!termId || !watches) return NONE;
    const keys = watches
      .filter((w) => w.termId === termId)
      .map((w) => w.sectionKey);
    return keys.length > 0 ? new Set(keys) : NONE;
  }, [termId, watches]);
}
