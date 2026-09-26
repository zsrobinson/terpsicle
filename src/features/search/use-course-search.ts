import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CatalogIndex } from "~/core/catalog";
import type { Course, TermId } from "~/core/schema";
import {
  courseFilter,
  isFiltering,
  type SearchFilters,
} from "~/core/search/filters";
import type { CourseSearch } from "~/core/search/search";
import { useFitContext, useTermCatalog } from "~/state/hooks";

// Course search on the main thread (core measured ~3 ms a keystroke on a full
// term). Everything goes through `useCourseResults`, so moving the index into
// the web worker later changes this file only.

// The text index (MiniSearch) loads when the Search tab first opens, not
// with the scheduler: filters alone don't need it.
type Engine = typeof import("~/core/search/search");
let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;
const listeners = new Set<() => void>();

/** Loads the search engine once; a failed load can be tried again. */
export function loadSearchEngine(): Promise<Engine> {
  loading ??= import("~/core/search/search").then(
    (m) => {
      engine = m;
      for (const listener of listeners) listener();
      return m;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

function useSearchEngine(): Engine | null {
  useEffect(() => {
    loadSearchEngine().catch((error: unknown) => console.error(error));
  }, []);
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => engine,
  );
}

const searches = new WeakMap<CatalogIndex, CourseSearch>();

/** The search index for a term's catalog, built once per catalog load. */
export function courseSearchFor(
  engine: Engine,
  index: CatalogIndex,
): CourseSearch {
  let search = searches.get(index);
  if (!search) {
    search = engine.createCourseSearch(index.courses.values());
    searches.set(index, search);
  }
  return search;
}

export type CourseResults =
  /** Nothing typed and no filter on: show the hints. */
  | { status: "idle" }
  /** The term's catalog is still loading. */
  | { status: "loading" }
  | { status: "ready"; courses: readonly Course[] };

/** Pure: matching courses, best first; filters alone list the catalog in code order. */
export function findCourses(
  engine: Engine,
  index: CatalogIndex,
  query: string,
  filters: SearchFilters,
  ctx: Parameters<typeof courseFilter>[1],
): readonly Course[] {
  const keep = courseFilter(filters, ctx);
  const candidates: Iterable<Course> = query.trim()
    ? engine
        .searchCourses(courseSearchFor(engine, index), query)
        .flatMap((code) => {
          const course = index.courses.get(code);
          return course ? [course] : [];
        })
    : index.courses.values();
  const out: Course[] = [];
  for (const course of candidates) if (keep(course)) out.push(course);
  return out;
}

export function useCourseResults(
  termId: TermId | null,
  query: string,
  filters: SearchFilters,
): CourseResults {
  const catalog = useTermCatalog(termId);
  const fit = useFitContext();
  const engine = useSearchEngine();
  const seats = catalog?.seats?.seats ?? null;
  const index = catalog?.index;
  const active = query.trim() !== "" || isFiltering(filters);
  const loading = !catalog?.complete && (index?.courses.size ?? 0) === 0;
  return useMemo((): CourseResults => {
    if (!active) return { status: "idle" };
    if (!index || loading || !engine) return { status: "loading" };
    return {
      status: "ready",
      courses: findCourses(engine, index, query, filters, { seats, fit }),
    };
  }, [active, index, loading, engine, query, filters, seats, fit]);
}
