import type { CourseCode, CourseIndexEntry, DeptCode } from "../schema";

// What the four-year planner knows about courses: the course index's
// department files loaded so far (docs/V3.md §2.2). Files load a department
// at a time, so "not loaded yet" and "not in Testudo" are different answers.

export type FourYearCourses = {
  /** Every course of the loaded department files, by code. */
  readonly courses: ReadonlyMap<CourseCode, CourseIndexEntry>;
  /**
   * Departments whose file has loaded, or that the index's manifest doesn't
   * list at all. A code missing from one of these isn't in Testudo.
   */
  readonly loadedDepts: ReadonlySet<DeptCode>;
};

/** A lookup over some index entries, with their departments counted as loaded. */
export function fourYearCourses(
  entries: Iterable<CourseIndexEntry>,
  extraLoadedDepts: Iterable<DeptCode> = [],
): FourYearCourses {
  const courses = new Map<CourseCode, CourseIndexEntry>();
  const loadedDepts = new Set<DeptCode>(extraLoadedDepts);
  for (const entry of entries) {
    courses.set(entry.code, entry);
    loadedDepts.add(entry.code.slice(0, 4));
  }
  return { courses, loadedDepts };
}

/** True only once the department has loaded and the code isn't in it. */
export function isUnknownCourse(
  lookup: FourYearCourses,
  code: CourseCode,
): boolean {
  return lookup.loadedDepts.has(code.slice(0, 4)) && !lookup.courses.has(code);
}

/**
 * Whether Testudo lets a course be taken again for credit. The index doesn't
 * keep the catalog's notes, but Testudo runs "Repeatable to 6 credits" into
 * the prerequisite or restriction sentence, which it does keep.
 */
export function isRepeatable(
  course: Pick<
    CourseIndexEntry,
    "prerequisite" | "corequisite" | "restriction"
  >,
): boolean {
  return [course.prerequisite, course.corequisite, course.restriction].some(
    (text) => text !== null && /\brepeatable\b/i.test(text),
  );
}
