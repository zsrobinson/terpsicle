import { create } from "zustand";
import {
  DEFAULT_TRAVEL_SETTINGS,
  type LocalId,
  type TermId,
  type TravelSettings,
} from "~/core/schema";
import { newLocalId, nowIso } from "./ids";
import {
  activePlanId,
  EMPTY_WORKSPACE,
  plansInTerm,
  reduceWorkspace,
  type Workspace,
  type WorkspaceAction,
} from "./plan-ops";

// The person's own data: plans, blocks, course colors, travel settings, and
// which plan is open in each term. Every change to the workspace goes through
// `commit`, which keeps a snapshot for undo (SPEC §3.1: undo instead of
// confirmation dialogs). Persistence is in persist.ts; toasts are the app's job
// (it watches `notice`).

/** One step of history: what the workspace looked like before `label`. */
export interface UndoEntry {
  label: string;
  before: Workspace;
}

/** The latest change, for the app to show a toast. `seq` increases every time. */
export interface ChangeNotice {
  seq: number;
  kind: "commit" | "undo" | "redo";
  /** Past tense and specific: "Deleted Plan B". */
  label: string;
  /** Destructive or structural changes get a toast with an Undo button. */
  toast: boolean;
}

export interface CommitOptions {
  /** Show the Undo toast. Default true; quiet edits (rename) pass false. */
  toast?: boolean;
}

export interface WorkspaceState extends Workspace {
  travel: TravelSettings;
  /** False until persisted state has loaded; don't create defaults before then. */
  hydrated: boolean;
  past: readonly UndoEntry[];
  future: readonly UndoEntry[];
  notice: ChangeNotice | null;

  /**
   * The general way to change the workspace: `recipe` returns the next
   * workspace (it must not mutate). A recipe that returns the same object is
   * a no-op and leaves history alone.
   */
  commit: (
    label: string,
    recipe: (w: Workspace) => Workspace,
    options?: CommitOptions,
  ) => void;
  /** Plan-level actions through the plan reducer. */
  dispatch: (
    action: WorkspaceAction,
    label: string,
    options?: CommitOptions,
  ) => void;
  undo: () => boolean;
  redo: () => boolean;
  /** Opening a plan tab isn't an edit: no history, no toast. */
  activatePlan: (termId: TermId, id: LocalId) => void;
  /** Makes sure the term has a plan to show (first visit). Not undoable. */
  ensurePlan: (termId: TermId) => void;
  /** Travel settings are preferences: saved, not undoable. */
  setTravel: (patch: Partial<TravelSettings>) => void;
}

/** Enough to undo a long session of poking around. */
export const UNDO_LIMIT = 100;

let seq = 0;
const notice = (
  kind: ChangeNotice["kind"],
  label: string,
  toast: boolean,
): ChangeNotice => ({ seq: ++seq, kind, label, toast });

export function workspaceOf(s: Workspace): Workspace {
  return {
    plans: s.plans,
    blocks: s.blocks,
    courseColors: s.courseColors,
    activePlanByTerm: s.activePlanByTerm,
  };
}

export const INITIAL_WORKSPACE_STATE = {
  ...EMPTY_WORKSPACE,
  travel: DEFAULT_TRAVEL_SETTINGS,
  hydrated: false,
  past: [],
  future: [],
  notice: null,
} satisfies Partial<WorkspaceState>;

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  ...INITIAL_WORKSPACE_STATE,

  commit: (label, recipe, options) => {
    const before = workspaceOf(get());
    const next = recipe(before);
    if (next === before) return;
    set({
      ...workspaceOf(next),
      past: [...get().past, { label, before }].slice(-UNDO_LIMIT),
      future: [],
      notice: notice("commit", label, options?.toast ?? true),
    });
  },

  dispatch: (action, label, options) =>
    get().commit(label, (w) => reduceWorkspace(w, action), options),

  undo: () => {
    const { past, future } = get();
    const entry = past.at(-1);
    if (!entry) return false;
    const current = workspaceOf(get());
    set({
      ...entry.before,
      past: past.slice(0, -1),
      future: [...future, { label: entry.label, before: current }],
      notice: notice("undo", entry.label, true),
    });
    return true;
  },

  redo: () => {
    const { past, future } = get();
    const entry = future.at(-1);
    if (!entry) return false;
    const current = workspaceOf(get());
    set({
      ...entry.before,
      future: future.slice(0, -1),
      past: [...past, { label: entry.label, before: current }],
      notice: notice("redo", entry.label, true),
    });
    return true;
  },

  activatePlan: (termId, id) => {
    const next = reduceWorkspace(workspaceOf(get()), {
      type: "plan/activate",
      termId,
      id,
    });
    set({ activePlanByTerm: next.activePlanByTerm });
  },

  ensurePlan: (termId) => {
    const state = get();
    if (!state.hydrated || plansInTerm(state.plans, termId).length > 0) return;
    const next = reduceWorkspace(workspaceOf(state), {
      type: "plan/create",
      id: newLocalId(),
      termId,
      now: nowIso(),
    });
    set(workspaceOf(next));
  },

  setTravel: (patch) => set({ travel: { ...get().travel, ...patch } }),
}));

/** The open plan's id in a term (see `activePlanId`). */
export function selectActivePlanId(termId: TermId | null) {
  return (s: WorkspaceState): LocalId | undefined =>
    termId ? activePlanId(s, termId) : undefined;
}
