// Finding a course or an instructor on /reviews: a course by its code or
// its title's words, an instructor by their name's.
import type {
  CourseSearchRow,
  InstructorSlug,
  PlanetTerpIndex,
} from "~/core/schema";

/** Courses whose code or title matches every word typed, codes first. */
export function matchCourses(
  rows: readonly CourseSearchRow[],
  query: string,
): CourseSearchRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const compact = query.toUpperCase().replace(/\s+/g, "");
  const byCode = rows.filter(([code]) => code.startsWith(compact));
  const byTitle = rows.filter(
    ([code, title]) =>
      !code.startsWith(compact) &&
      words.every((w) => title.toLowerCase().includes(w)),
  );
  return [...byCode, ...byTitle];
}

/** An instructor the search found: [slug, name]. */
export type InstructorMatch = [InstructorSlug, string];

/**
 * Instructors whose name has every word typed, those whose name starts with
 * a word first (so "ada" finds Ada Brandt before Jo Canada).
 * Nothing for a course code: that's a course search.
 */
export function matchInstructors(
  instructors: PlanetTerpIndex["instructors"],
  query: string,
): InstructorMatch[] {
  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length === 0 || /\d/.test(query)) return [];
  const found: { match: InstructorMatch; starts: boolean }[] = [];
  for (const [slug, [name]] of Object.entries(instructors)) {
    const parts = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[\s-]+/);
    if (!words.every((w) => parts.some((p) => p.includes(w)))) continue;
    found.push({
      match: [slug, name],
      starts: words.every((w) => parts.some((p) => p.startsWith(w))),
    });
  }
  return found
    .sort(
      (a, b) =>
        Number(b.starts) - Number(a.starts) ||
        a.match[1].localeCompare(b.match[1]),
    )
    .map((f) => f.match);
}
