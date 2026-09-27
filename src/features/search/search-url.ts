import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { currentView, goTo } from "~/app/schedule-nav";
import { routeAt } from "~/app/schedule-view";
import { TAB_PATHS } from "~/core/routing/schedule-location";
import type { TermId } from "~/core/schema";
import {
  ScheduleSearchSchema,
  SearchTabSearchSchema,
} from "~/core/schema/schedule-url";
import type { SearchFilters } from "~/core/search/filters";
import { filtersFromParams, sameFilters } from "~/core/search/url";
import { readActiveTermId } from "~/state/hooks";
import { useSearchStore } from "./search-store";

// Search's text and chips in its URL (`/schedule/search?q=cmsc&openSeats=1`),
// so a reload, a copied link and Back land on the same search. Typing
// replaces the entry, so Back skips every keystroke; a chip pushes one, so
// Back undoes it (src/app/README.md, "URL state").

/** Writes the open term's search to the URL, while Search is on screen. */
function write(termId: TermId, replace: boolean): void {
  const here = currentView();
  if (here.tab !== "search" || here.drill || termId !== readActiveTermId())
    return;
  goTo({ tab: "search", drill: null }, { replace });
}

/** Typing in the box. */
export function typeQuery(termId: TermId, query: string): void {
  useSearchStore.getState().setQuery(termId, query);
  write(termId, true);
}

/** A filter chip, or clearing them: a place Back returns from. */
export function pickFilters(termId: TermId, filters: SearchFilters): void {
  const before = useSearchStore.getState().byTerm[termId]?.filters;
  if (before && sameFilters(before, filters)) return;
  useSearchStore.getState().setFilters(termId, filters);
  write(termId, false);
}

/**
 * Puts the box and chips where the URL says: when Search opens on a URL
 * (a reload, a link), and on Back and Forward. The app's own moves already
 * say the same thing, so pushes and replaces are left alone.
 */
export function useSearchFromUrl(termId: TermId | null): void {
  const router = useRouter();
  useEffect(() => {
    const adopt = () => {
      const { pathname, search } = router.history.location;
      if (routeAt(router, pathname).id !== TAB_PATHS.search) return;
      const raw = router.options.parseSearch(search);
      const term = ScheduleSearchSchema.parse(raw).term ?? termId;
      if (!term) return;
      const params = SearchTabSearchSchema.parse(raw);
      const query = params.q ?? "";
      const filters = filtersFromParams(params);
      const store = useSearchStore.getState();
      const now = store.byTerm[term];
      if (now?.query === query && sameFilters(now.filters, filters)) return;
      useSearchStore.setState({
        byTerm: { ...store.byTerm, [term]: { query, filters } },
      });
    };
    adopt();
    return router.history.subscribe(
      ({ action }: { action: { type: string } }) => {
        if (action.type !== "PUSH" && action.type !== "REPLACE") adopt();
      },
    );
  }, [router, termId]);
}
