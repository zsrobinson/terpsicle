import { create } from "zustand";
import { planCourseItems } from "~/core/generate/draft";
import {
  DEFAULT_MUST_HAVES,
  DEFAULT_RANK_BY,
  type GenerateDraft,
  type GenerateDrafts,
  type Plan,
  type TermId,
} from "~/core/schema";

// What the person has typed into Generate, per term (SPEC §3.9), kept in
// IndexedDB by persist.ts so leaving the tab or the app doesn't lose it.
// Not undoable: these are inputs being filled in, not changes to plans.

export const EMPTY_DRAFT: GenerateDraft = {
  items: [],
  mustHaves: DEFAULT_MUST_HAVES,
  rankBy: DEFAULT_RANK_BY,
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

/**
 * A term's draft. Before the person has touched the form, it starts with
 * the open plan's courses (QA S16: an empty form with a disabled button
 * read as broken to someone with a plan). The prefill is never stored, so
 * it follows the plan until the first edit, and a saved draft, even one
 * emptied on purpose, always wins: it can't replace a list someone built.
 */
export function draftFor(
  drafts: GenerateDrafts,
  termId: TermId,
  plan: Pick<Plan, "termId" | "courses"> | null = null,
): GenerateDraft {
  const saved = drafts[termId];
  if (saved) return saved;
  if (!plan || plan.termId !== termId || plan.courses.length === 0)
    return EMPTY_DRAFT;
  return { ...EMPTY_DRAFT, items: planCourseItems(plan.courses) };
}
