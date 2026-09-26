import { KNOWN_GEN_EDS, padPattern, parseWildcard } from "../catalog/wildcard";
import type { Course, DeptCode, GenEdCode, Wildcard } from "../schema";

// Wildcards as search suggestions (Generate's course field): "CMSC4XX" and
// "DSHS" suggest themselves first, and a department on its own, or with one
// digit, suggests its pattern last ("CMSC4" → Any CMSC 400-level), which is
// how people find out patterns exist. A near miss ("CMSC4X") gets a hint.

export type WildcardSearchInfo = {
  /** Departments with courses this term. */
  readonly depts: ReadonlySet<DeptCode>;
  /** Gen-ed codes to recognise: UMD's, plus any new one the catalog uses. */
  readonly genEds: readonly GenEdCode[];
};

/** Built once per catalog. */
export function wildcardSearchInfo(
  courses: Iterable<Course>,
): WildcardSearchInfo {
  const depts = new Set<DeptCode>();
  const genEds = new Set<GenEdCode>(KNOWN_GEN_EDS);
  for (const course of courses) {
    depts.add(course.code.slice(0, 4));
    for (const group of course.genEds)
      for (const o of group) genEds.add(o.code);
  }
  return { depts, genEds: [...genEds] };
}

export type WildcardSuggestions = {
  /** What was typed, when it's a wildcard: the first suggestion. */
  readonly exact: Wildcard | null;
  /** A department's pattern, offered after the courses. */
  readonly related: Wildcard | null;
  /** How to fix something that's nearly a pattern ("Put X only at the end, as in CMSC4XX."). */
  readonly hint: string | null;
};

const DEPT_AND_DIGIT = /^([A-Z]{4})(\d?)$/;

export function suggestWildcards(
  query: string,
  info: WildcardSearchInfo,
): WildcardSuggestions {
  const parsed = parseWildcard(query, info.genEds);
  if (parsed.kind === "wildcard")
    return { exact: parsed.wildcard, related: null, hint: null };
  if (parsed.kind === "invalid")
    return { exact: null, related: null, hint: parsed.message };
  const m = DEPT_AND_DIGIT.exec(query.toUpperCase().replace(/[\s-]+/g, ""));
  const dept = m?.[1];
  if (dept && info.depts.has(dept))
    return {
      exact: null,
      related: { kind: "pattern", pattern: padPattern(dept, m?.[2] ?? "") },
      hint: null,
    };
  return { exact: null, related: null, hint: null };
}
