import { create } from "zustand";
import {
  DEFAULT_MUST_HAVES,
  type GenerateDraft,
  type GenerateDrafts,
  type TermId,
} from "~/core/schema";

// What the person has typed into Generate, per term (SPEC §3.9), kept in
// IndexedDB by persist.ts so leaving the tab or the app doesn't lose it.
// Not undoable: these are inputs being filled in, not changes to plans.

export const EMPTY_DRAFT: GenerateDraft = {
  items: [],
  mustHaves: DEFAULT_MUST_HAVES,
  rankBy: { preset: "compact" },
};

export interface GenerateDraftsState {
  drafts: GenerateDrafts;
  /** Replaces a term's draft (the form's single write path). */
  setDraft: (termId: TermId, draft: GenerateDraft) => void;
}

export const useGenerateDrafts = create<GenerateDraftsState>()((set, get) => ({
  drafts: {},
  setDraft: (termId, draft) =>
    set({ drafts: { ...get().drafts, [termId]: draft } }),
}));

/** A term's draft, or an empty one. */
export function draftFor(
  drafts: GenerateDrafts,
  termId: TermId,
): GenerateDraft {
  return drafts[termId] ?? EMPTY_DRAFT;
}
