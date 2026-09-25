import MiniSearch, { type Options, type SearchOptions } from "minisearch";
import type { Course, CourseCode } from "../schema";

// Course search (SPEC §3.5): code, title or instructor, with typo tolerance.
// MiniSearch runs in the web worker with these options; course codes get
// their own tokenizing and a ranking tier above text relevance, so "cmsc 351",
// "CMSC351", "351" and "cmsc35" all put the right course first.

export type CourseSearchDoc = {
  readonly id: CourseCode;
  readonly code: string;
  readonly title: string;
  readonly instructors: string;
};

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

export const SEARCH_OPTIONS: SearchOptions = {
  boost: { code: 4, title: 2, instructors: 1 },
  combineWith: "AND",
  prefix: (_term, i, terms) => i === terms.length - 1,
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

export function createCourseSearch(courses: Iterable<Course>): CourseSearch {
  const docs = [...courses].map(courseSearchDoc);
  const mini = new MiniSearch<CourseSearchDoc>(MINISEARCH_OPTIONS);
  mini.addAll(docs);
  return { mini, codes: docs.map((d) => d.code).sort() };
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

const CODE_PREFIX = /^[A-Z]{1,4}$|^[A-Z]{4}\d{1,3}[A-Z]{0,2}$/;
const NUMBER_PREFIX = /^\d{1,3}[A-Z]{0,2}$/;

/**
 * Course codes best match first:
 * 1. the exact code, then other codes the query is a prefix of, in code order;
 * 2. codes whose number starts with the query ("351"), in code order;
 * 3. everything else MiniSearch finds, by relevance.
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
  for (const hit of search.mini.search(query)) take(hit.id as CourseCode);
  return out;
}
