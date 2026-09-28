import type { Course, DeptCode, PlanetTerpDept } from "../schema";
import { instructorNameKey, sectionKey } from "../schema";
import { type SeatsMap, seatCounts } from "../seats/seats";

// Sorting Search's results (owner, 2026-09-28: "by a professor's average
// rating or the number of open seats"). Only data already on the client:
// the term's seats file, and whichever departments' PlanetTerp files are
// loaded. A course with nothing to sort by goes after the rest, in the
// order it had.

export const SEARCH_SORTS = ["relevance", "code", "rating", "seats"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/** Open seats across every section; null when the seats file isn't loaded. */
export function openSeatTotal(
  course: Course,
  seats: SeatsMap | null,
): number | null {
  if (!seats) return null;
  let open = 0;
  for (const s of course.sections)
    open += Math.max(
      0,
      seatCounts(seats, sectionKey(course.code, s.code))?.open ?? 0,
    );
  return open;
}

/**
 * The best PlanetTerp rating among the course's instructors this term: the
 * one you'd pick a section for. Null when its department's file isn't
 * loaded, or no instructor has a rating.
 */
export function bestInstructorRating(
  course: Course,
  planetTerp: (dept: DeptCode) => PlanetTerpDept | undefined,
): number | null {
  const dept = planetTerp(course.code.slice(0, 4));
  if (!dept) return null;
  let best: number | null = null;
  for (const section of course.sections)
    for (const name of section.instructors) {
      const slug = dept.names[instructorNameKey(name)];
      const rating = slug ? dept.instructors[slug]?.rating : null;
      if (rating != null && (best === null || rating > best)) best = rating;
    }
  return best;
}

export type SortContext = {
  readonly seats: SeatsMap | null;
  readonly planetTerp: (dept: DeptCode) => PlanetTerpDept | undefined;
};

/** Highest first; courses with no value keep their order, after the rest. */
function byValue(
  courses: readonly Course[],
  value: (course: Course) => number | null,
): Course[] {
  const valued = courses.map((course, i) => ({ course, i, v: value(course) }));
  valued.sort((a, b) => {
    if (a.v === null || b.v === null)
      return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
    return b.v - a.v || a.i - b.i;
  });
  return valued.map((x) => x.course);
}

/** The results in the chosen order; `relevance` is the order they came in. */
export function sortCourses(
  courses: readonly Course[],
  sort: SearchSort,
  ctx: SortContext,
): readonly Course[] {
  switch (sort) {
    case "relevance":
      return courses;
    case "code":
      return [...courses].sort((a, b) =>
        a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
      );
    case "rating":
      return byValue(courses, (c) => bestInstructorRating(c, ctx.planetTerp));
    case "seats":
      return byValue(courses, (c) => openSeatTotal(c, ctx.seats));
  }
}

/**
 * How many of the results' departments have ratings loaded, for the
 * option's words: rating a course needs its department's PlanetTerp file,
 * which loads when a course from it is opened.
 */
export function ratedDepartments(
  courses: readonly Course[],
  planetTerp: (dept: DeptCode) => PlanetTerpDept | undefined,
): { readonly loaded: number; readonly total: number } {
  const depts = new Set(courses.map((c) => c.code.slice(0, 4)));
  let loaded = 0;
  for (const d of depts) if (planetTerp(d)) loaded++;
  return { loaded, total: depts.size };
}
