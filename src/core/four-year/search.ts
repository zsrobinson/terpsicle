import type { CourseCode, CourseSearchRow, Wildcard } from "../schema";
import {
  isFiltering,
  type SearchFilters,
  searchRowFilter,
} from "../search/filters";
import type { CourseSearch } from "../search/search";
import { parseCourseQuery, queryFilters } from "../search/tokens";
import {
  type WildcardSearchInfo,
  wildcardSearchInfoFromRows,
} from "../search/wildcards";
import { searchRowMayResolve } from "./wildcards";

// Plan's search over the course index's search file (docs/V3.md §2.2): about
// 5,000 rows, every term. It's the scheduler's engine (~/core/search), so a
// code, a title's words ("intro psych"), a pattern ("cmsc4xx") and a filter
// token ("DSHS", "400s") read the same in both. The rows have no
// instructors, so only those don't match here.

/** The engine's module, which Plan loads when Search first opens. */
export type SearchEngine = Pick<
  typeof import("../search/search"),
  "createRowSearch" | "queryCourses"
>;

export type FourYearSearchFilter = {
  /** "Pick a course" for a placeholder: only courses that may resolve it. */
  readonly wildcard?: Wildcard | null;
};

export type FourYearSearchResult = {
  readonly rows: readonly CourseSearchRow[];
  /** Every match, of which `rows` are the first `limit`. */
  readonly total: number;
};

/** How many results the list shows. */
export const FOUR_YEAR_SEARCH_LIMIT = 50;

type RowIndex = {
  readonly search: CourseSearch;
  readonly info: WildcardSearchInfo;
  readonly byCode: ReadonlyMap<CourseCode, CourseSearchRow>;
};

const indexes = new WeakMap<readonly CourseSearchRow[], RowIndex>();

/** Built once per search file. */
function rowIndex(
  engine: SearchEngine,
  rows: readonly CourseSearchRow[],
): RowIndex {
  let index = indexes.get(rows);
  if (!index) {
    index = {
      search: engine.createRowSearch(rows),
      info: wildcardSearchInfoFromRows(rows),
      byCode: new Map(rows.map((r) => [r[0], r])),
    };
    indexes.set(rows, index);
  }
  return index;
}

/** Recognises GenEd codes and departments for the search box's filter tokens. */
export function fourYearSearchInfo(
  rows: readonly CourseSearchRow[],
): WildcardSearchInfo {
  return wildcardSearchInfoFromRows(rows);
}

/**
 * Courses for what someone typed and the chips, best first. With nothing
 * typed, no chip and no placeholder, nothing; otherwise everything they
 * allow, in code order.
 */
export function searchFourYearCourses(
  engine: SearchEngine,
  rows: readonly CourseSearchRow[],
  query: string,
  filters: SearchFilters,
  filter: FourYearSearchFilter = {},
  limit: number = FOUR_YEAR_SEARCH_LIMIT,
): FourYearSearchResult {
  const index = rowIndex(engine, rows);
  const parsed = parseCourseQuery(query, index.info);
  const effective = queryFilters(filters, parsed);
  const scoped = !!filter.wildcard;
  if (
    parsed.text.trim() === "" &&
    parsed.patterns.length === 0 &&
    !isFiltering(effective) &&
    !scoped
  )
    return { rows: [], total: 0 };
  const passes = searchRowFilter(effective);
  const wildcard = filter.wildcard;
  const matches = engine.queryCourses(
    index.search,
    parsed,
    (code) => index.byCode.get(code),
    (row) => passes(row) && (!wildcard || searchRowMayResolve(wildcard, row)),
  );
  return { rows: matches.slice(0, limit), total: matches.length };
}

/** "3 cr", "1–4 cr". */
export function searchRowCredits(row: CourseSearchRow): string {
  return row[2] === row[3] ? `${row[2]} cr` : `${row[2]}–${row[3]} cr`;
}
