import { KNOWN_GEN_EDS } from "../catalog/wildcard";
import type { CourseSearchRow, GenEdCode, Wildcard } from "../schema";
import { searchRowMayResolve } from "./wildcards";

// Plan's search over the course index's search file (docs/V3.md §2.2): about
// 5,000 rows, small enough to scan on each keystroke. A code ("cmsc 35",
// "CMSC351") matches by prefix; a GenEd code lists what counts for it;
// anything else matches the title's words.

export type FourYearSearchFilter = {
  /** "Find a course" from the GenEd tab: only courses that can count for it. */
  readonly genEd?: GenEdCode | null;
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

const CODE_PREFIX = /^[A-Z]{1,4}(\d{0,3}[A-Z]?)?$/;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function passes(row: CourseSearchRow, filter: FourYearSearchFilter): boolean {
  if (filter.genEd && !row[4].includes(filter.genEd)) return false;
  if (filter.wildcard && !searchRowMayResolve(filter.wildcard, row))
    return false;
  return true;
}

/**
 * Courses for what someone typed, best first. An empty query lists every
 * course the filter allows (none without one), in code order.
 */
export function searchFourYearCourses(
  rows: readonly CourseSearchRow[],
  query: string,
  filter: FourYearSearchFilter = {},
  limit: number = FOUR_YEAR_SEARCH_LIMIT,
): FourYearSearchResult {
  const text = query.trim();
  const code = text.toUpperCase().replace(/[\s-]+/g, "");
  const filtered = !!(filter.genEd || filter.wildcard);
  let matches: CourseSearchRow[];
  if (text === "") {
    matches = filtered ? rows.filter((r) => passes(r, filter)) : [];
  } else if (KNOWN_GEN_EDS.includes(code) && !filter.genEd) {
    // "DSHS": what counts for it, rather than titles with "dshs" in them.
    matches = rows.filter((r) => r[4].includes(code) && passes(r, filter));
  } else if (CODE_PREFIX.test(code)) {
    const byCode = rows.filter(
      (r) => r[0].startsWith(code) && passes(r, filter),
    );
    // "math" is a department and a word: codes first, then titles.
    const byTitle =
      /^[A-Z]{1,4}$/.test(code) && code.length > 2
        ? titleMatches(rows, text, filter).filter((r) => !r[0].startsWith(code))
        : [];
    matches = [...byCode, ...byTitle];
  } else {
    matches = titleMatches(rows, text, filter);
  }
  return { rows: matches.slice(0, limit), total: matches.length };
}

/** Every word typed starts a word of the title; titles that start with the query first. */
function titleMatches(
  rows: readonly CourseSearchRow[],
  text: string,
  filter: FourYearSearchFilter,
): CourseSearchRow[] {
  const wanted = words(text);
  if (wanted.length === 0) return [];
  const lead = wanted.join(" ");
  const starts: CourseSearchRow[] = [];
  const rest: CourseSearchRow[] = [];
  for (const row of rows) {
    if (!passes(row, filter)) continue;
    const title = words(row[1]);
    if (!wanted.every((w) => title.some((t) => t.startsWith(w)))) continue;
    (title.join(" ").startsWith(lead) ? starts : rest).push(row);
  }
  return [...starts, ...rest];
}

/** "3 cr", "1–4 cr". */
export function searchRowCredits(row: CourseSearchRow): string {
  return row[2] === row[3] ? `${row[2]} cr` : `${row[2]}–${row[3]} cr`;
}
