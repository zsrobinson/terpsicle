import type {
  CourseCode,
  CourseIndexEntry,
  DeptCode,
  GenEdCode,
} from "../schema";
import type {
  FourYearCourseDetails,
  FourYearCourseEntry,
  FourYearEntry,
} from "../schema/four-year";

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
 * The details someone gave a course, while the index doesn't know its code.
 * Once it does (a department file that lists it after all), Testudo wins.
 */
export function courseDetails(
  lookup: FourYearCourses,
  entry: Pick<FourYearCourseEntry, "code" | "details">,
): FourYearCourseDetails | null {
  if (!entry.details || lookup.courses.has(entry.code)) return null;
  return entry.details;
}

/**
 * The UMD course an entry counts as, for prerequisites and repeats: a
 * course's own code, or the one its course info says it counts as while
 * Testudo doesn't list it; a transfer credit's "Counts as". Null for a
 * placeholder, and for credit that counts as no course.
 */
export function countsAsCode(
  lookup: FourYearCourses,
  entry: FourYearEntry,
): CourseCode | null {
  if (entry.kind === "course")
    return courseDetails(lookup, entry)?.countsAs ?? entry.code;
  if (entry.kind === "credit") return entry.countsAs ?? null;
  return null;
}

const HONORS_CODE = /^([A-Z]{4}\d{3})H$/;

/**
 * The course an honors code is a version of, when Testudo lists that one:
 * MATH241H → MATH241. Null for any other code.
 */
export function honorsBase(
  lookup: FourYearCourses,
  code: CourseCode,
): CourseIndexEntry | null {
  const base = HONORS_CODE.exec(code)?.[1];
  return base === undefined ? null : (lookup.courses.get(base) ?? null);
}

/** A course's one-option GenEds: where Testudo says "or", the person picks. */
export function fixedGenEds(course: CourseIndexEntry): GenEdCode[] {
  const genEds = course.genEds.flatMap((group) =>
    group.length === 1 && group[0] && !group[0].condition
      ? [group[0].code]
      : [],
  );
  return [...new Set(genEds)].slice(0, 8);
}

/**
 * An index entry's details, for a code that stands in for it: its title,
 * its one-option GenEds, and counting as it.
 */
export function detailsFromCourse(
  course: CourseIndexEntry,
): FourYearCourseDetails {
  return {
    title: course.title,
    genEds: fixedGenEds(course),
    countsAs: course.code,
  };
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
