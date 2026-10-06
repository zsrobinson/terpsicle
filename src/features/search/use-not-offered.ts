import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type NotOfferedMatch,
  notOfferedMatches,
  type OfferedCourse,
  readHistoryOffered,
} from "~/core/history/offered";
import type { CourseCode, CourseSearchRow, TermId } from "~/core/schema";
import type { HistoryOffered } from "~/core/schema/history";
import { isFiltering, type SearchFilters } from "~/core/search/filters";
import type { CourseSearch } from "~/core/search/search";
import { parseCourseQuery } from "~/core/search/tokens";
import { useCatalog } from "~/state/catalog-store";
import { useTermCatalog } from "~/state/hooks";
import { offeredManifestQuery, offeredQuery } from "~/state/query/history";
import { usePublishedSource } from "~/state/query/published";
import { type SearchEngine, useSearchEngine } from "~/state/search-engine";
import { searchInfoFor } from "./use-course-search";

// Courses a search matches that the term doesn't have (the owner,
// 2026-10-05: "if i search for class X on the schedule tab, nothing shows
// up. we do know this course exists, though"). They come from the offered
// file (DATA.md §3.5), read only once someone types, and show after the
// term's own results, greyed, with when they run. A search with filters on
// shows none: the file doesn't know sections, GenEds or levels.

const NONE: readonly NotOfferedMatch[] = [];

type OfferedSearch = {
  readonly search: CourseSearch;
  readonly courses: ReadonlyMap<CourseCode, OfferedCourse>;
};

const searches = new WeakMap<HistoryOffered, OfferedSearch>();

/** The offered file's courses as a code-and-title search, built once per file. */
function offeredSearchFor(
  engine: SearchEngine,
  file: HistoryOffered,
): OfferedSearch {
  let found = searches.get(file);
  if (!found) {
    const rows: CourseSearchRow[] = file.courses.map(
      ([code, title, min, max]) => [
        code,
        title ?? code,
        min ?? 0,
        max ?? 0,
        [],
      ],
    );
    found = {
      search: engine.createRowSearch(rows),
      courses: readHistoryOffered(file),
    };
    searches.set(file, found);
  }
  return found;
}

/** The search's matches the term doesn't have, best first; none while anything loads. */
export function useNotOffered(
  termId: TermId | null,
  query: string,
  filters: SearchFilters,
): readonly NotOfferedMatch[] {
  const catalog = useTermCatalog(termId);
  const terms = useCatalog((s) => s.terms);
  const engine = useSearchEngine();
  const source = usePublishedSource((s) => s.source);
  const index = catalog?.settled ? catalog.index : undefined;
  const parsed = useMemo(
    () => (index ? parseCourseQuery(query, searchInfoFor(index)) : null),
    [index, query],
  );
  // Words only: a code pattern or a filter is about this term's sections.
  const text =
    parsed &&
    parsed.patterns.length === 0 &&
    parsed.tokens.length === 0 &&
    !isFiltering(filters)
      ? parsed.text.trim()
      : "";
  const manifest = useQuery({
    ...offeredManifestQuery(source),
    enabled: text !== "",
  });
  const file = useQuery({
    ...offeredQuery(source, manifest.data?.hash),
    enabled: text !== "",
  });
  return useMemo(() => {
    if (!text || !index || !engine || !file.data || !terms || !termId)
      return NONE;
    const { search, courses } = offeredSearchFor(engine, file.data);
    const now = terms.reduce((a, t) => (t.id > a ? t.id : a), termId);
    return notOfferedMatches({
      ranked: engine.searchCourses(search, text),
      inTerm: (code) => index.courses.has(code),
      offered: courses,
      recorded: file.data.terms,
      listed: new Set(
        terms.filter((t) => t.status === "active").map((t) => t.id),
      ),
      now,
      termId,
      query: text,
    });
  }, [text, index, engine, file.data, terms, termId]);
}
