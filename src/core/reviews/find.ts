// Finding a course on /reviews by its code or its title's words.
import type { CourseSearchRow } from "~/core/schema";

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
