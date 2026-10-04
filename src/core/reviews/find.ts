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
 * Instructors whose name has every word typed, anywhere in a part of it
 * ("wyss", "gallif"). Those with a part that starts with each word come
 * first (so "ada" finds Ada Brandt before Jo Canada), then the most
 * reviewed: the professors people look for (owner, 2026-09-29: "justin"
 * should find Justin Wyss-Gallifent first). `reviewCounts` fills in counts
 * an older index lacks. Nothing for a course code: that's a course search.
 */
export function matchInstructors(
  instructors: PlanetTerpIndex["instructors"],
  query: string,
  reviewCounts: ReadonlyMap<InstructorSlug, number> = new Map(),
): InstructorMatch[] {
  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length === 0 || /\d/.test(query)) return [];
  const found: { match: InstructorMatch; starts: boolean; reviews: number }[] =
    [];
  for (const [slug, entry] of Object.entries(instructors)) {
    const [name] = entry;
    const parts = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[\s-]+/);
    if (!words.every((w) => parts.some((p) => p.includes(w)))) continue;
    found.push({
      match: [slug, name],
      starts: words.every((w) => parts.some((p) => p.startsWith(w))),
      reviews: entry[2] ?? reviewCounts.get(slug) ?? 0,
    });
  }
  return found
    .sort(
      (a, b) =>
        Number(b.starts) - Number(a.starts) ||
        b.reviews - a.reviews ||
        a.match[1].localeCompare(b.match[1]),
    )
    .map((f) => f.match);
}
