import {
  matchesPattern,
  matchesWildcard,
  parseWildcard,
  type WildcardParse,
} from "../catalog/wildcard";
import type {
  CourseIndexEntry,
  CourseSearchRow,
  GenEdCode,
  Wildcard,
} from "../schema";

// Placeholder blocks (docs/V3.md §2.9) on the shared matcher from
// `v2/wildcards` (`src/core/catalog/wildcard.ts`). Plan adds nothing to the
// matching: a conditional GenEd ("DSNL if taken with GEOL110") doesn't
// resolve a DSNL placeholder, and a choice ("DSHS or DSHU") resolves either.

/**
 * What someone typed into Plan's search, read as a placeholder: the
 * matcher's patterns and GenEd codes, plus "any DSHS" and "Any CMSC4XX".
 */
export function parsePlaceholder(input: string): WildcardParse {
  return parseWildcard(input.trim().replace(/^any\s+/i, ""));
}

/** Whether a course can replace the placeholder ("Pick a course"). */
export function resolvesWildcard(
  wildcard: Wildcard,
  course: Pick<CourseIndexEntry, "code" | "genEds">,
): boolean {
  return matchesWildcard(wildcard, course);
}

/**
 * A quick pass over the search file before department files load: a pattern
 * is decided here; a GenEd row may still carry the code only conditionally,
 * so `resolvesWildcard` on the department entry has the last word.
 */
export function searchRowMayResolve(
  wildcard: Wildcard,
  row: CourseSearchRow,
): boolean {
  return wildcard.kind === "pattern"
    ? matchesPattern(wildcard.pattern, row[0])
    : row[4].includes(wildcard.code);
}

/**
 * The GenEd choices that resolving a GenEd placeholder implies: "Any DSHS
 * course" resolved with a "DSHS or DSHU" course counts it as DSHS.
 */
export function choicesForWildcard(
  wildcard: Wildcard,
  course: Pick<CourseIndexEntry, "genEds">,
): Record<string, GenEdCode> {
  if (wildcard.kind !== "gen-ed") return {};
  const choices: Record<string, GenEdCode> = {};
  course.genEds.forEach((group, i) => {
    if (
      group.length > 1 &&
      group.some((o) => o.code === wildcard.code && !o.condition)
    )
      choices[String(i)] = wildcard.code;
  });
  return choices;
}
