import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import { matchesPattern } from "../catalog/wildcard";
import type { Course, CourseCode, CourseSearchRow } from "../schema";
import type { CourseQuery } from "./tokens";

// Course search (SPEC §3.5): code, title or instructor, with typo tolerance.
// One engine for every course search box (Schedule's Search, Plan's Search,
// Generate's course field), over whatever that product has loaded: a
// term's courses, with instructors, or the course index's rows, without.
// Course codes get their own tokenizing and a ranking tier above text
// relevance, so "cmsc 351", "CMSC351", "351" and "cmsc35" all put the right
// course first. Every word matches as a prefix, so "intro psych" finds
// Introduction to Psychology.

export type CourseSearchDoc = {
  readonly id: CourseCode;
  readonly code: string;
  readonly title: string;
  readonly instructors: string;
};

/** A course index row (Plan): code and title, no instructors. */
export function searchRowDoc(row: CourseSearchRow): CourseSearchDoc {
  return { id: row[0], code: row[0], title: row[1], instructors: "" };
}

export function courseSearchDoc(course: Course): CourseSearchDoc {
  const names = new Set(course.sections.flatMap((s) => s.instructors));
  return {
    id: course.code,
    code: course.code,
    title: course.title,
    instructors: [...names].join(" "),
  };
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Splits "cmsc351" into "cmsc" and "351", but keeps "351h" whole. */
const LETTERS_THEN_DIGITS = /^(\p{L}+)(\p{N}.*)$/u;

function words(text: string): string[] {
  return (
    text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(WORD) ??
    []
  );
}

/** Index-side: a course code yields itself, its department, its number and the number's digits. */
export function codeTokens(code: string): string[] {
  const lower = code.toLowerCase();
  const dept = lower.slice(0, 4);
  const number = lower.slice(4);
  const digits = number.replace(/\D+$/, "");
  return [...new Set([lower, dept, number, digits].filter(Boolean))];
}

/** Query-side: words, with a letters-then-digits word split in two. */
export function queryTokens(query: string): string[] {
  return words(query).flatMap((w) => {
    const m = LETTERS_THEN_DIGITS.exec(w);
    return m?.[1] && m[2] ? [m[1], m[2]] : [w];
  });
}

/** Typos allowed only in words (4+ letters, no digits): codes must match as typed. */
export function fuzziness(term: string): number | false {
  return term.length >= 4 && !/\d/.test(term) ? 0.2 : false;
}

/**
 * Small words a title may say another way ("intro to psych", "Psychology:
 * an Introduction"): dropped from a query that has other words.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

/** The query without its stop words, unless that leaves nothing. */
export function withoutStopWords(query: string): string {
  const kept = words(query).filter((w) => !STOP_WORDS.has(w));
  return kept.length > 0 ? kept.join(" ") : query;
}

export const SEARCH_OPTIONS: SearchOptions = {
  boost: { code: 4, title: 2, instructors: 1 },
  combineWith: "AND",
  // Every word, not just the last: "intro psych" is how people type titles.
  prefix: true,
  fuzzy: (term) => fuzziness(term),
  maxFuzzy: 2,
  tokenize: queryTokens,
};

export const MINISEARCH_OPTIONS: Options<CourseSearchDoc> = {
  fields: ["code", "title", "instructors"],
  storeFields: [],
  tokenize: (text, field) =>
    field === "code" ? codeTokens(text) : words(text),
  processTerm: (term) => term.toLowerCase(),
  searchOptions: SEARCH_OPTIONS,
};

export type CourseSearch = {
  readonly mini: MiniSearch<CourseSearchDoc>;
  /** Every indexed code, sorted, for code-prefix lookups. */
  readonly codes: readonly CourseCode[];
};

function indexDocs(docs: readonly CourseSearchDoc[]): CourseSearch {
  const mini = new MiniSearch<CourseSearchDoc>(MINISEARCH_OPTIONS);
  mini.addAll(docs);
  return { mini, codes: docs.map((d) => d.code).sort() };
}

/** A term's courses, with their instructors (Schedule, Generate). */
export function createCourseSearch(courses: Iterable<Course>): CourseSearch {
  return indexDocs([...courses].map(courseSearchDoc));
}

/** The course index's rows (Plan): codes and titles, every term. */
export function createRowSearch(rows: Iterable<CourseSearchRow>): CourseSearch {
  return indexDocs([...rows].map(searchRowDoc));
}

/** The first index in sorted `codes` at or after `prefix`. */
function lowerBound(codes: readonly string[], prefix: string): number {
  let lo = 0;
  let hi = codes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((codes[mid] ?? "") < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function codesWithPrefix(codes: readonly string[], prefix: string): string[] {
  const out: string[] = [];
  for (let i = lowerBound(codes, prefix); i < codes.length; i++) {
    const code = codes[i] ?? "";
    if (!code.startsWith(prefix)) break;
    out.push(code);
  }
  return out;
}

/** Shorter queries only match codes. */
export const MIN_TEXT_QUERY = 2;

const CODE_PREFIX = /^[A-Z]{1,4}$|^[A-Z]{4}\d{1,3}[A-Z]?$/;
const NUMBER_PREFIX = /^\d{1,3}[A-Z]?$/;

/**
 * The department a query starts with ("cmsc3", "cmsc prog"), when the term
 * has one: its courses outrank other departments' typo matches (FMSC374 for
 * "cmsc3").
 */
function queryDept(search: CourseSearch, query: string): string | null {
  const first = queryTokens(query)[0]?.toUpperCase() ?? "";
  if (!/^[A-Z]{4}$/.test(first)) return null;
  const next = search.codes[lowerBound(search.codes, first)] ?? "";
  return next.startsWith(first) ? first : null;
}

/**
 * Course codes best match first:
 * 1. the exact code, then other codes the query is a prefix of, in code order;
 * 2. codes whose number starts with the query ("351"), in code order;
 * 3. everything else MiniSearch finds, by relevance (from two characters on),
 *    the query's department first.
 */
export function searchCourses(
  search: CourseSearch,
  query: string,
): CourseCode[] {
  const compact = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact === "") return [];
  const seen = new Set<CourseCode>();
  const out: CourseCode[] = [];
  const take = (code: CourseCode) => {
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  };
  if (CODE_PREFIX.test(compact)) {
    const matches = codesWithPrefix(search.codes, compact);
    if (matches.includes(compact)) take(compact);
    for (const code of matches) take(code);
  }
  if (NUMBER_PREFIX.test(compact))
    for (const code of search.codes)
      if (code.slice(4).startsWith(compact)) take(code);
  // One character matches a prefix of nearly every word; only codes are useful.
  if (compact.length < MIN_TEXT_QUERY) return out;
  const hits = search.mini
    .search(withoutStopWords(query))
    .map((hit) => hit.id as CourseCode);
  const dept = queryDept(search, query);
  if (dept) for (const code of hits) if (code.startsWith(dept)) take(code);
  for (const code of hits) take(code);
  return out;
}

/**
 * What a parsed query finds, best first, as the caller's items (`get`),
 * kept by `keep` (the chips plus the query's filter tokens: `queryFilters`).
 * With text, the index ranks; without, a pattern lists its codes and chips
 * alone list every course, in code order. A pattern narrows the text's
 * results ("cmsc4xx algorithms"); two patterns take either.
 */
export function queryCourses<T>(
  search: CourseSearch,
  query: CourseQuery,
  get: (code: CourseCode) => T | undefined,
  keep: (item: T) => boolean,
): T[] {
  const codes =
    query.text.trim() !== "" ? searchCourses(search, query.text) : search.codes;
  const out: T[] = [];
  for (const code of codes) {
    if (
      query.patterns.length > 0 &&
      !query.patterns.some((p) => matchesPattern(p, code))
    )
      continue;
    const item = get(code);
    if (item !== undefined && keep(item)) out.push(item);
  }
  return out;
}
