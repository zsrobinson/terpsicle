import {
  type CourseCode,
  CourseCodeSchema,
  type InstructorId,
  InstructorIdSchema,
} from "../schema";

// Reviews' page addresses (docs/V2.md §1.1): one level under /reviews for
// instructors and courses alike, so a search result reads like a name:
// /reviews/kruskal, /reviews/cmsc351. A course code is four letters and
// three digits (and maybe a letter), which nobody's name is, so the pattern
// alone tells the two apart.
//
// An instructor's address is their id: PlanetTerp's slug (their last name,
// or `last_first` when two share it), with the underscore written as a
// hyphen, since search engines read a hyphen as a space and an underscore
// as a join (goldman_aaron → goldman-aaron). A minted `t~` id is its own
// address.

/** A course's address: its code in lowercase. */
export function courseSlug(code: CourseCode): string {
  return code.toLowerCase();
}

/** The course an address names, in any case; null when it isn't a code. */
export function courseFromSlug(slug: string): CourseCode | null {
  const parsed = CourseCodeSchema.safeParse(slug.toUpperCase());
  return parsed.success ? parsed.data : null;
}

/** An instructor's address. */
export function instructorSlug(id: InstructorId): string {
  return id.replaceAll("_", "-");
}

/**
 * The ids an instructor's address could stand for, likeliest first: the
 * address as it is (a hyphenated last name, or an old underscore address),
 * then each hyphen read as PlanetTerp's underscore, left to right.
 */
export function instructorIdCandidates(slug: string): InstructorId[] {
  const out = new Set<string>([slug]);
  for (let i = slug.indexOf("-"); i !== -1; i = slug.indexOf("-", i + 1))
    out.add(`${slug.slice(0, i)}_${slug.slice(i + 1)}`);
  return [...out].filter((id) => InstructorIdSchema.safeParse(id).success);
}

/**
 * The instructor an address names: the first candidate `known` has. With no
 * hyphen there's only one reading, so nothing needs looking up (and null
 * when it isn't a valid id).
 */
export function resolveInstructorSlug(
  slug: string,
  known: (id: InstructorId) => boolean,
): InstructorId | null {
  const candidates = instructorIdCandidates(slug);
  return candidates.find(known) ?? null;
}

/** Whether an address has more than one reading, so needs the index. */
export function isAmbiguousSlug(slug: string): boolean {
  return instructorIdCandidates(slug).length > 1;
}

/** `/reviews/<slug>` for a course. */
export function coursePagePath(code: CourseCode): string {
  return `/reviews/${courseSlug(code)}`;
}

/** `/reviews/<slug>` for an instructor. */
export function instructorPagePath(id: InstructorId): string {
  return `/reviews/${encodeURIComponent(instructorSlug(id))}`;
}
