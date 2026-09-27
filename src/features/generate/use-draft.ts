import { useCallback, useMemo } from "react";
import type { GenerateDraft, Plan, TermId } from "~/core/schema";
import {
  draftFor,
  EMPTY_DRAFT,
  useGenerateDrafts,
} from "~/state/generate-drafts";

export type DraftUpdate = (
  change: (draft: GenerateDraft) => GenerateDraft,
) => void;

/**
 * The term's Generate form, and a way to change it (kept per term). Until
 * the first change it shows the open plan's courses (`draftFor`), and says
 * so with its third value.
 */
export function useDraft(
  termId: TermId | null,
  plan: Plan | null,
): [GenerateDraft, DraftUpdate, boolean] {
  // The saved draft alone: the prefill is a new object, so it's made here.
  const saved = useGenerateDrafts((s) =>
    termId ? s.drafts[termId] : undefined,
  );
  const draft = useMemo(
    () => saved ?? (termId ? draftFor({}, termId, plan) : EMPTY_DRAFT),
    [saved, termId, plan],
  );
  const update = useCallback<DraftUpdate>(
    (change) => {
      if (!termId) return;
      const { drafts, setDraft } = useGenerateDrafts.getState();
      setDraft(termId, change(draftFor(drafts, termId, plan)));
    },
    [termId, plan],
  );
  // The courses shown are the plan's, not yet the person's own list.
  const prefilled = saved === undefined && draft.items.length > 0;
  return [draft, update, prefilled];
}
