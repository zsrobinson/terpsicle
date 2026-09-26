import { create } from "zustand";
import type { TermId } from "~/core/schema";
import { NO_FILTERS, type SearchFilters, sameFilters } from "~/core/search";
import { useUi } from "~/state/ui-store";

// What the person typed and picked in Search, per term, for this visit.
// Switching tabs or terms and coming back finds it as it was (SPEC §3.13);
// it isn't persisted between visits (DATA §5: search text isn't stored).
// The URL carries the open term's (`?q=&gened=…`): typing replaces the
// entry, a filter chip pushes one, so Back undoes a chip but not a letter.

export interface TermSearch {
  query: string;
  filters: SearchFilters;
}

const EMPTY: TermSearch = { query: "", filters: NO_FILTERS };

interface SearchState {
  byTerm: Readonly<Partial<Record<TermId, TermSearch>>>;
  setQuery: (termId: TermId, query: string) => void;
  setFilters: (termId: TermId, filters: SearchFilters) => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  byTerm: {},
  setQuery: (termId, query) => {
    const current = get().byTerm[termId] ?? EMPTY;
    if (current.query !== query)
      set({ byTerm: { ...get().byTerm, [termId]: { ...current, query } } });
  },
  setFilters: (termId, filters) => {
    const current = get().byTerm[termId] ?? EMPTY;
    if (sameFilters(current.filters, filters)) return;
    set({ byTerm: { ...get().byTerm, [termId]: { ...current, filters } } });
    useUi.getState().markNavigation();
  },
}));

export function useTermSearch(termId: TermId | null): TermSearch {
  return useSearchStore((s) => (termId ? (s.byTerm[termId] ?? EMPTY) : EMPTY));
}
