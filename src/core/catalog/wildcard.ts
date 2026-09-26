import {
  type Course,
  type CourseCode,
  type DeptCode,
  GEN_ED_LABELS,
  type GenEdCode,
  type Wildcard,
  type WildcardId,
  WildcardIdSchema,
  type WildcardPattern,
} from "../schema";

// Wildcards (owner request, 2026-09-26): "you know you need to take some
// number of upper levels but not which one". CMSC4XX is any CMSC 400-level,
// ARTTXXX any ARTT course, and a gen-ed code any course that counts for it.
// Generate treats one as "pick one course from this set"; the four-year
// planner will reuse the same matching.
//
// Two rules the catalog forces a choice on:
// - Suffix letters match. CMSC4XX includes CMSC498A and AAAS4XX includes
//   AAAS400H: special topics and honors versions are 400-level courses, and
//   an upper-level requirement counts them.
// - A conditional gen-ed doesn't count by default. GEOL100 is "DSNL if taken
//   with GEOL110, or DSNS": it's a DSNS course, but not a DSNL one unless
//   the student also takes GEOL110, which a placeholder can't promise.
//   `conditional: true` counts it (the planner may want to, with the note).
//   A choice between codes ("DSHS or DSHU") counts for each of them.

const DIGITS_THEN_XS = /^\d*X+$/;

export type WildcardParse =
  | { readonly kind: "wildcard"; readonly wildcard: Wildcard }
  /** It looks like a pattern but isn't one; `message` says how to fix it. */
  | { readonly kind: "invalid"; readonly message: string }
  /** Not a wildcard at all (a course code, words, …). */
  | { readonly kind: "none" };

const NONE: WildcardParse = { kind: "none" };

/** The gen-ed codes UMD uses today. */
export const KNOWN_GEN_EDS: readonly GenEdCode[] = Object.keys(GEN_ED_LABELS);

/** "cmsc 4xx" → "CMSC4XX": case, spaces and dashes don't matter. */
function compact(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, "");
}

/** A department and some leading digits, padded out with X: "CMSC4" → "CMSC4XX". */
export function padPattern(dept: DeptCode, digits: string): WildcardPattern {
  return `${dept}${digits.slice(0, 2)}${"X".repeat(3 - Math.min(2, digits.length))}`;
}

/**
 * Reads what someone typed: a pattern ("CMSC4XX", "cmsc 4xx"), a gen-ed code
 * ("DSHS", from `genEds`), or neither. "CMSC4X" and "CMSC4X1" are
 * `invalid`, with a message; "BUSI758X" is a course code (X as its suffix
 * letter), so it's `none`.
 */
export function parseWildcard(
  input: string,
  genEds: Iterable<GenEdCode> = KNOWN_GEN_EDS,
): WildcardParse {
  const text = compact(input);
  const m = /^([A-Z]{4})([\dX]+)$/.exec(text);
  if (m) {
    const dept = m[1] ?? "";
    const number = m[2] ?? "";
    // No X among the number's digits: a course code, or part of one.
    if (!number.slice(0, 3).includes("X")) return NONE;
    const lead = /^\d*/.exec(number)?.[0] ?? "";
    const example = padPattern(dept, lead);
    if (number.length !== 3)
      return {
        kind: "invalid",
        message: `Use three places for the number, as in ${example}.`,
      };
    if (!DIGITS_THEN_XS.test(number))
      return {
        kind: "invalid",
        message: `Put X only at the end, as in ${example}.`,
      };
    return { kind: "wildcard", wildcard: { kind: "pattern", pattern: text } };
  }
  if (/^[A-Z]{4}$/.test(text) && [...genEds].includes(text))
    return { kind: "wildcard", wildcard: { kind: "gen-ed", code: text } };
  return NONE;
}

/** "CMSC4XX", or "gen-ed:DSHS". */
export function wildcardId(wildcard: Wildcard): WildcardId {
  return wildcard.kind === "pattern"
    ? wildcard.pattern
    : `gen-ed:${wildcard.code}`;
}

/** The wildcard an id names; null when it isn't one. */
export function wildcardFromId(id: string): Wildcard | null {
  if (!WildcardIdSchema.safeParse(id).success) return null;
  return id.startsWith("gen-ed:")
    ? { kind: "gen-ed", code: id.slice("gen-ed:".length) }
    : { kind: "pattern", pattern: id };
}

export function sameWildcard(a: Wildcard, b: Wildcard): boolean {
  return wildcardId(a) === wildcardId(b);
}

/** The department a pattern draws from; null for a gen-ed, which spans them. */
export function wildcardDept(wildcard: Wildcard): DeptCode | null {
  return wildcard.kind === "pattern" ? wildcard.pattern.slice(0, 4) : null;
}

/** "4XX" → "400-level"; "42X" → "420–429"; "XXX" → null (any number). */
function numberWords(pattern: WildcardPattern): string | null {
  const number = pattern.slice(4);
  const lead = number.replace(/X+$/, "");
  if (lead === "") return null;
  if (lead.length === 1) return `${lead}00-level`;
  return `${lead}0–${lead}9`;
}

/** "Any CMSC 400-level", "Any CMSC 420–429", "Any ARTT course", "Any DSHS course". */
export function wildcardLabel(wildcard: Wildcard): string {
  if (wildcard.kind === "gen-ed") return `Any ${wildcard.code} course`;
  const dept = wildcard.pattern.slice(0, 4);
  const number = numberWords(wildcard.pattern);
  return number ? `Any ${dept} ${number}` : `Any ${dept} course`;
}

/**
 * The set as a noun for sentences, plural unless `count` is 1: "CMSC
 * 400-level courses", "CMSC courses numbered 420–429", "ARTT courses",
 * "DSHS course".
 */
export function wildcardNoun(wildcard: Wildcard, count = 2): string {
  const courses = count === 1 ? "course" : "courses";
  if (wildcard.kind === "gen-ed") return `${wildcard.code} ${courses}`;
  const dept = wildcard.pattern.slice(0, 4);
  const number = numberWords(wildcard.pattern);
  if (number === null) return `${dept} ${courses}`;
  return number.endsWith("-level")
    ? `${dept} ${number} ${courses}`
    : `${dept} ${courses} numbered ${number}`;
}

/** A gen-ed's name ("History and Social Sciences"); null for patterns and unknown codes. */
export function wildcardDetail(wildcard: Wildcard): string | null {
  return wildcard.kind === "gen-ed"
    ? (GEN_ED_LABELS[wildcard.code] ?? null)
    : null;
}

/** Whether a course code fits a pattern. Suffix letters match (CMSC498A is a CMSC4XX). */
export function matchesPattern(
  pattern: WildcardPattern,
  code: CourseCode,
): boolean {
  // Only the number's X's are trimmed: a department can end in X.
  const fixed = pattern.slice(0, 4) + pattern.slice(4).replace(/X+$/, "");
  return code.startsWith(fixed) && /^\d{3}[A-Z]?$/.test(code.slice(4));
}

export type MatchOptions = {
  /** Count conditional gen-eds ("DSNL if taken with GEOL110"). Off by default. */
  readonly conditional?: boolean;
};

/** Whether the course can count for this gen-ed code. */
export function countsForGenEd(
  course: Pick<Course, "genEds">,
  code: GenEdCode,
  { conditional = false }: MatchOptions = {},
): boolean {
  return course.genEds.some((group) =>
    group.some((o) => o.code === code && (conditional || !o.condition)),
  );
}

/** Whether a course is one of the wildcard's set (whether or not it's offered). */
export function matchesWildcard(
  wildcard: Wildcard,
  course: Pick<Course, "code" | "genEds">,
  options: MatchOptions = {},
): boolean {
  return wildcard.kind === "pattern"
    ? matchesPattern(wildcard.pattern, course.code)
    : countsForGenEd(course, wildcard.code, options);
}

export type WildcardCoursesOptions = MatchOptions & {
  /** Courses listed on their own, which the wildcard mustn't pick again. */
  readonly exclude?: ReadonlySet<CourseCode>;
};

/**
 * A term's courses the wildcard can pick, in the order given: the ones that
 * match and have at least one section (CMSC499A, independent study with no
 * sections, can't go on a schedule).
 */
export function wildcardCourses(
  courses: Iterable<Course>,
  wildcard: Wildcard,
  options: WildcardCoursesOptions = {},
): Course[] {
  const out: Course[] = [];
  for (const course of courses)
    if (
      course.sections.length > 0 &&
      !options.exclude?.has(course.code) &&
      matchesWildcard(wildcard, course, options)
    )
      out.push(course);
  return out;
}

/** "Spring 2027 has no CMSC 400-level courses." */
export function noMatchesMessage(wildcard: Wildcard, termName: string): string {
  const term = termName.charAt(0).toUpperCase() + termName.slice(1);
  return `${term} has no ${wildcardNoun(wildcard)}.`;
}
