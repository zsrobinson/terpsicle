import { useMemo } from "react";
import type { CatalogIndex } from "~/core/catalog";
import type { Course, TermId } from "~/core/schema";
import {
  type CourseSearch,
  courseFilter,
  createCourseSearch,
  isFiltering,
  type SearchFilters,
  searchCourses,
} from "~/core/search";
import { useFitContext, useTermCatalog } from "~/state/hooks";

// Course search on the main thread (core measured ~3 ms a keystroke on a full
// term). Everything goes through `useCourseResults`, so moving the index into
// the web worker later changes this file only.

const searches = new WeakMap<CatalogIndex, CourseSearch>();

/** The search index for a term's catalog, built once per catalog load. */
export function courseSearchFor(index: CatalogIndex): CourseSearch {
  let search = searches.get(index);
  if (!search) {
    search = createCourseSearch(index.courses.values());
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
  index: CatalogIndex,
  query: string,
  filters: SearchFilters,
  ctx: Parameters<typeof courseFilter>[1],
): readonly Course[] {
  const keep = courseFilter(filters, ctx);
  const candidates: Iterable<Course> = query.trim()
    ? searchCourses(courseSearchFor(index), query).flatMap((code) => {
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
  const seats = catalog?.seats?.seats ?? null;
  const index = catalog?.index;
  const active = query.trim() !== "" || isFiltering(filters);
  const loading = !catalog?.complete && (index?.courses.size ?? 0) === 0;
  return useMemo((): CourseResults => {
    if (!active) return { status: "idle" };
    if (!index || loading) return { status: "loading" };
    return {
      status: "ready",
      courses: findCourses(index, query, filters, { seats, fit }),
    };
  }, [active, index, loading, query, filters, seats, fit]);
}
