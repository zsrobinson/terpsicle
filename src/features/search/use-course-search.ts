import { useMemo } from "react";
import type { CatalogIndex } from "~/core/catalog";
import type { Course, DeptCode, TermId } from "~/core/schema";
import {
  courseFilter,
  isFiltering,
  type SearchFilters,
} from "~/core/search/filters";
import type { CourseSearch } from "~/core/search/search";
import { type SearchSort, sortCourses } from "~/core/search/sort";
import { parseCourseQuery, queryFilters } from "~/core/search/tokens";
import {
  type WildcardSearchInfo,
  wildcardSearchInfo,
} from "~/core/search/wildcards";
import { useCatalog } from "~/state/catalog-store";
import { useFitContext, useTermCatalog } from "~/state/hooks";
import { type SearchEngine, useSearchEngine } from "~/state/search-engine";

// Course search on the main thread (core measured ~3 ms a keystroke on a full
// term). Everything goes through `useCourseResults`, so moving the index into
// the web worker later changes this file only. The engine is the one every
// course search box uses (~/core/search), loaded when Search first opens
// (~/state/search-engine): filters alone don't need it.

const searches = new WeakMap<CatalogIndex, CourseSearch>();

/** The search index for a term's catalog, built once per catalog load. */
export function courseSearchFor(
  engine: SearchEngine,
  index: CatalogIndex,
): CourseSearch {
  let search = searches.get(index);
  if (!search) {
    search = engine.createCourseSearch(index.courses.values());
    searches.set(index, search);
  }
  return search;
}

const infos = new WeakMap<CatalogIndex, WildcardSearchInfo>();

/** The term's departments and GenEd codes, for reading filter tokens. */
export function searchInfoFor(index: CatalogIndex): WildcardSearchInfo {
  let info = infos.get(index);
  if (!info) {
    info = wildcardSearchInfo(index.courses.values());
    infos.set(index, info);
  }
  return info;
}

export type CourseResults =
  /** Nothing typed and no filter on: show the hints. */
  | { status: "idle" }
  /** The term's catalog is still loading. */
  | { status: "loading" }
  | { status: "ready"; courses: readonly Course[] };

/** Pure: matching courses, best first; filters alone list the catalog in code order. */
export function findCourses(
  engine: SearchEngine,
  index: CatalogIndex,
  query: string,
  filters: SearchFilters,
  ctx: Parameters<typeof courseFilter>[1],
): readonly Course[] {
  const parsed = parseCourseQuery(query, searchInfoFor(index));
  const keep = courseFilter(queryFilters(filters, parsed), ctx);
  return engine.queryCourses(
    courseSearchFor(engine, index),
    parsed,
    (code) => index.courses.get(code),
    keep,
  );
}

/** The term's departments and GenEd codes, once the whole term has loaded. */
export function useSearchInfo(
  termId: TermId | null,
): WildcardSearchInfo | null {
  const catalog = useTermCatalog(termId);
  const index = catalog?.settled ? catalog.index : undefined;
  return useMemo(() => (index ? searchInfoFor(index) : null), [index]);
}

export function useCourseResults(
  termId: TermId | null,
  query: string,
  filters: SearchFilters,
  sort: SearchSort = "relevance",
): CourseResults {
  const catalog = useTermCatalog(termId);
  const fit = useFitContext();
  const engine = useSearchEngine();
  const planetTerp = useCatalog((s) => s.instructors);
  const seats = catalog?.seats?.seats ?? null;
  const index = catalog?.index;
  const active = query.trim() !== "" || isFiltering(filters);
  // Only the whole term: the departments on screen load first, and results
  // from those alone would read as "no such course".
  const loading = !catalog?.settled;
  const found = useMemo((): CourseResults => {
    if (!active) return { status: "idle" };
    if (!index || loading || !engine) return { status: "loading" };
    return {
      status: "ready",
      courses: findCourses(engine, index, query, filters, { seats, fit }),
    };
  }, [active, index, loading, engine, query, filters, seats, fit]);
  return useMemo(
    () =>
      found.status === "ready" && sort !== "relevance"
        ? {
            status: "ready",
            courses: sortCourses(found.courses, sort, {
              seats,
              planetTerp: (dept: DeptCode) => planetTerp[dept],
            }),
          }
        : found,
    [found, sort, seats, planetTerp],
  );
}
