import { useCallback } from "react";
import type { GenerateDraft, TermId } from "~/core/schema";
import {
  draftFor,
  EMPTY_DRAFT,
  useGenerateDrafts,
} from "~/state/generate-drafts";

export type DraftUpdate = (
  change: (draft: GenerateDraft) => GenerateDraft,
) => void;

/** The term's Generate form, and a way to change it (kept per term). */
export function useDraft(termId: TermId | null): [GenerateDraft, DraftUpdate] {
  const draft = useGenerateDrafts((s) =>
    termId ? draftFor(s.drafts, termId) : EMPTY_DRAFT,
  );
  const update = useCallback<DraftUpdate>(
    (change) => {
      if (!termId) return;
      const { drafts, setDraft } = useGenerateDrafts.getState();
      setDraft(termId, change(draftFor(drafts, termId)));
    },
    [termId],
  );
  return [draft, update];
}
