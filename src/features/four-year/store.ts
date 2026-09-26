import { create } from "zustand";
import {
  EMPTY_FOUR_YEAR_STATE,
  type FourYearAction,
  type FourYearState,
  fourYearReducer,
} from "~/core/four-year/reducer";
import {
  applyWithHistory,
  canRedo,
  canUndo,
  createHistory,
  type History,
  redo,
  undo,
} from "~/core/plans/history";
import type { LocalId } from "~/core/schema";
import { type FourYearDoc, FourYearDocSchema } from "~/core/schema/four-year";
import { FourYearPrefsSchema } from "~/core/schema/local";
import { diffById, type TerpsicleDb } from "~/state/db";

// Terpsicle Plan's four-year docs (docs/V3.md §2.3): the core reducer with
// the scheduler's undo history, saved to Dexie's `fourYear` table after each
// change. Local first: the sync engine (`v3/four-year-sync`) will read and
// write the same table, so everything a person changes goes through here.

/** What the undo toast says, and whether it's a change or an undo. */
export type FourYearNotice = {
  readonly kind: "change" | "undo" | "redo";
  readonly label: string;
  /** Bumps per notice, so the same words twice still show a toast. */
  readonly seq: number;
};

export interface FourYearStore {
  /** `loading` until the saved docs are read. */
  phase: "loading" | "ready";
  history: History<FourYearState>;
  /** The doc people chose; `activeDoc` falls back to the first. */
  activeId: LocalId | null;
  notice: FourYearNotice | null;
  /** IndexedDB refused a write: changes last only until the tab closes. */
  storageFailed: boolean;
  /** Reads the saved docs, then saves every change. Without a db, memory only. */
  start: (db: TerpsicleDb | null) => Promise<void>;
  /** Applies an action; true when it changed something. `label` makes a toast. */
  dispatch: (action: FourYearAction, label?: string) => boolean;
  setActive: (id: LocalId) => void;
  undo: () => void;
  redo: () => void;
}

/** Labels of the steps undo would take back, so its toast can say "Undone: …". */
const labels = new WeakMap<FourYearState, string>();

let seq = 0;

/** Writes run one after another, in the order the changes happened. */
let queue: Promise<void> = Promise.resolve();

/** Resolves once every change so far is written (tests, and before a reload). */
export function whenSaved(): Promise<void> {
  return queue;
}
const notice = (kind: FourYearNotice["kind"], label: string) => ({
  kind,
  label,
  seq: ++seq,
});

/** Reads rows, skipping (and logging) any that don't validate (DATA.md §5). */
export function validDocs(rows: readonly unknown[]): FourYearDoc[] {
  const docs: FourYearDoc[] = [];
  for (const row of rows) {
    const parsed = FourYearDocSchema.safeParse(row);
    if (parsed.success) docs.push(parsed.data);
    else
      console.warn(
        "Skipped a four-year plan that doesn't validate",
        parsed.error,
      );
  }
  return docs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const INITIAL_FOUR_YEAR_STORE = {
  phase: "loading",
  history: createHistory(EMPTY_FOUR_YEAR_STATE),
  activeId: null,
  notice: null,
  storageFailed: false,
} satisfies Partial<FourYearStore>;

export const useFourYear = create<FourYearStore>()((set, get) => {
  let db: TerpsicleDb | null = null;
  let saved: readonly FourYearDoc[] = [];

  const failed = (error: unknown) => {
    console.error(error);
    set({ storageFailed: true });
  };

  const save = () => {
    const target = db;
    if (!target) return;
    const docs = get().history.present.docs;
    const { put, remove } = diffById(saved, docs, (d) => d.id);
    saved = docs;
    if (put.length === 0 && remove.length === 0) return;
    queue = queue
      .then(() =>
        target.transaction("rw", target.fourYear, async () => {
          if (put.length > 0) await target.fourYear.bulkPut(put);
          if (remove.length > 0) await target.fourYear.bulkDelete(remove);
        }),
      )
      .catch(failed);
  };

  const savePrefs = (activeId: LocalId | null) => {
    const target = db;
    if (!target) return;
    queue = queue
      .then(async () => {
        await target.settings.put({ key: "fourYear", value: { activeId } });
      })
      .catch(failed);
  };

  return {
    ...INITIAL_FOUR_YEAR_STORE,

    start: async (next) => {
      db = next;
      if (!next) {
        set({ phase: "ready" });
        return;
      }
      try {
        const [rows, prefsRow] = await Promise.all([
          next.fourYear.toArray(),
          next.settings.get("fourYear"),
        ]);
        const docs = validDocs(rows);
        const prefs = FourYearPrefsSchema.safeParse(prefsRow?.value);
        saved = docs;
        set({
          phase: "ready",
          history: createHistory({ docs }),
          activeId: prefs.success ? prefs.data.activeId : null,
        });
      } catch (error) {
        // Private modes can refuse IndexedDB: work in memory for the visit.
        db = null;
        failed(error);
        set({ phase: "ready" });
      }
    },

    dispatch: (action, label) => {
      const before = get().history;
      const history = applyWithHistory(before, fourYearReducer, action);
      if (history === before) return false;
      if (label) labels.set(history.present, label);
      const created =
        action.type === "create" || action.type === "duplicate"
          ? action.id
          : null;
      set({
        history,
        ...(label ? { notice: notice("change", label) } : {}),
        ...(created ? { activeId: created } : {}),
      });
      if (created) savePrefs(created);
      save();
      return true;
    },

    setActive: (id) => {
      if (get().activeId === id) return;
      set({ activeId: id });
      savePrefs(id);
    },

    undo: () => {
      const { history } = get();
      if (!canUndo(history)) return;
      const label = labels.get(history.present);
      set({
        history: undo(history),
        notice: notice("undo", label ?? "Your last change"),
      });
      save();
    },

    redo: () => {
      const { history } = get();
      if (!canRedo(history)) return;
      const next = redo(history);
      const label = labels.get(next.present);
      set({
        history: next,
        notice: notice("redo", label ?? "Your last change"),
      });
      save();
    },
  };
});

/** The open doc: the chosen one, else the first; null when there's none. */
export function activeDoc(
  state: Pick<FourYearStore, "history" | "activeId">,
): FourYearDoc | null {
  const { docs } = state.history.present;
  return docs.find((d) => d.id === state.activeId) ?? docs[0] ?? null;
}

/** The open doc, as a hook. */
export function useActiveFourYear(): FourYearDoc | null {
  return useFourYear(activeDoc);
}
