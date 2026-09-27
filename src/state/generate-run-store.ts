import { create } from "zustand";
import type { GenerateRequest, GenerateResult, TermId } from "~/core/schema";

// The Generate tab's state, apart from the code that runs a search: the shell
// reads it for a generated plan's name and to drop a result that's gone,
// while the tab itself, the generator and its worker client load when
// Generate is first opened (scripts/check-bundle.ts). The actions are in
// ~/features/generate/run-store.

export type RunStatus =
  | { kind: "idle" }
  /** Loading the courses, seats, routes and ratings the request needs. */
  | { kind: "loading" }
  | { kind: "running"; steps: number; found: number }
  | {
      kind: "done";
      request: GenerateRequest;
      result: GenerateResult;
      durationMs: number;
    }
  | { kind: "error"; message: string };

/**
 * What the tab shows: the form, or the latest results under a one-line
 * summary of what was asked (UX-REVIEW §4.8). A finished run shows its
 * results; "Edit" goes back to the form.
 */
export type GenerateView = "form" | "results";

/** A generated plan's name by its rank: "Option 3". */
export const optionLabel = (rank: number) => `Option ${rank}`;

export interface GenerateRunState {
  termId: TermId | null;
  status: RunStatus;
  /**
   * Which one the tab shows when next opened. While it's on screen the URL
   * says (`/schedule/generate?view=results`); this remembers it.
   */
  view: GenerateView;
  /** Result ids ticked for "Save N plans". */
  selected: readonly string[];
  toggleSelected: (resultId: string) => void;
  clearSelected: () => void;
  setView: (view: GenerateView) => void;
}

export const INITIAL_RUN_STATE = {
  termId: null,
  status: { kind: "idle" },
  view: "form",
  selected: [],
} satisfies Partial<GenerateRunState>;

export const useGenerateRun = create<GenerateRunState>()((set, get) => ({
  ...INITIAL_RUN_STATE,
  toggleSelected: (resultId) => {
    const { selected } = get();
    set({
      selected: selected.includes(resultId)
        ? selected.filter((id) => id !== resultId)
        : [...selected, resultId],
    });
  },
  clearSelected: () => set({ selected: [] }),
  setView: (view) => {
    if (get().view !== view) set({ view });
  },
}));
