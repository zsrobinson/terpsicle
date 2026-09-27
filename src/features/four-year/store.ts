import { create } from "zustand";
import {
  EMPTY_FOUR_YEAR_STATE,
  type FourYearAction,
  type FourYearState,
  fourYearReducer,
} from "~/core/four-year/reducer";
import {
  type RemoteFourYearDocs,
  rebaseFourYearHistory,
  withRemoteDocs,
} from "~/core/four-year/remote";
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
// change. Local first: when someone is signed in, the sync engine reads and
// writes the same table (V3 §2.4) and shows what comes from the account
// through `applyRemote`, which undo never takes back.

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
  /**
   * Who made the last change to the docs: the person (an action, undo or
   * redo), which sync pushes, or the account or IndexedDB, which it doesn't.
   */
  changedBy: "person" | "account";
  /** Reads the saved docs, then saves every change. Without a db, memory only. */
  start: (db: TerpsicleDb | null) => Promise<void>;
  /** Applies an action; true when it changed something. `label` makes a toast. */
  dispatch: (action: FourYearAction, label?: string) => boolean;
  setActive: (id: LocalId) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Shows docs from the account (sync has already written them): not
   * undoable, no toast, and undo never brings back what they replaced.
   */
  applyRemote: (docs: RemoteFourYearDocs) => void;
  /** Reads the saved docs again, for a page that comes back after sync ran elsewhere. */
  refresh: () => Promise<void>;
  /** Runs a write after every change queued so far (sync's dirty flags). */
  enqueue: (write: () => Promise<unknown>) => void;
  /** Stops writing to IndexedDB (signing out and removing plans). */
  stopSaving: () => void;
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

/**
 * History spans every doc: an undo that changes another doc than the open
 * one opens that doc, so the step is never invisible.
 */
function followChange(
  before: FourYearState,
  after: FourYearState,
  activeId: LocalId | null,
): { activeId?: LocalId } {
  const open = activeDoc({ history: { present: before }, activeId });
  const changed = after.docs.find((d) => !before.docs.includes(d));
  return changed && changed.id !== open?.id ? { activeId: changed.id } : {};
}

export const INITIAL_FOUR_YEAR_STORE = {
  phase: "loading",
  history: createHistory(EMPTY_FOUR_YEAR_STATE),
  activeId: null,
  notice: null,
  storageFailed: false,
  changedBy: "account",
} satisfies Partial<FourYearStore>;

export const useFourYear = create<FourYearStore>()((set, get) => {
  let db: TerpsicleDb | null = null;
  let saved: readonly FourYearDoc[] = [];

  const failed = (error: unknown) => {
    console.error(error);
    set({ storageFailed: true });
  };

  // Called before `set`, so the write is queued ahead of anything a
  // subscriber queues (sync marks the doc dirty only after it's written).
  const save = (docs: readonly FourYearDoc[]) => {
    const target = db;
    if (!target) return;
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
          changedBy: "account",
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
      save(history.present.docs);
      set({
        history,
        changedBy: "person",
        ...(label ? { notice: notice("change", label) } : {}),
        ...(created ? { activeId: created } : {}),
      });
      if (created) savePrefs(created);
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
      const next = undo(history);
      save(next.present.docs);
      set({
        history: next,
        changedBy: "person",
        notice: notice("undo", label ?? "Your last change"),
        ...followChange(history.present, next.present, get().activeId),
      });
    },

    redo: () => {
      const { history } = get();
      if (!canRedo(history)) return;
      const next = redo(history);
      const label = labels.get(next.present);
      save(next.present.docs);
      set({
        history: next,
        changedBy: "person",
        notice: notice("redo", label ?? "Your last change"),
        ...followChange(history.present, next.present, get().activeId),
      });
    },

    applyRemote: (docs) => {
      if (docs.length === 0) return;
      const { history } = get();
      const next = rebaseFourYearHistory(history, docs, (from, to) => {
        const label = labels.get(from);
        if (label) labels.set(to, label);
      });
      // Sync wrote these itself: what's saved moves with them, so the next
      // change doesn't write them again.
      saved = withRemoteDocs({ docs: saved }, docs).docs;
      if (next !== history) set({ history: next, changedBy: "account" });
    },

    refresh: async () => {
      const target = db;
      if (!target) return;
      await queue;
      const before = get().history.present;
      let rows: FourYearDoc[];
      try {
        rows = validDocs(await target.fourYear.toArray());
      } catch (error) {
        console.error(error);
        return;
      }
      // Docs changed here while reading are this page's newer version.
      const now = get().history.present.docs;
      const nowIds = new Set(now.map((d) => d.id));
      const touched = new Set([
        ...now.filter((d) => !before.docs.includes(d)).map((d) => d.id),
        ...before.docs.filter((d) => !nowIds.has(d.id)).map((d) => d.id),
      ]);
      const stored = new Map(rows.map((d) => [d.id, d]));
      const changes: [LocalId, FourYearDoc | null][] = [];
      for (const d of now)
        if (!touched.has(d.id) && !stored.has(d.id)) changes.push([d.id, null]);
      for (const d of rows) if (!touched.has(d.id)) changes.push([d.id, d]);
      get().applyRemote(changes);
    },

    enqueue: (write) => {
      queue = queue
        .then(async () => {
          await write();
        })
        .catch(failed);
    },

    stopSaving: () => {
      db = null;
    },
  };
});

/** The open doc: the chosen one, else the first; null when there's none. */
export function activeDoc(state: {
  readonly history: { readonly present: FourYearState };
  readonly activeId: LocalId | null;
}): FourYearDoc | null {
  const { docs } = state.history.present;
  return docs.find((d) => d.id === state.activeId) ?? docs[0] ?? null;
}

/** The open doc, as a hook. */
export function useActiveFourYear(): FourYearDoc | null {
  return useFourYear(activeDoc);
}
