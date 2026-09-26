import {
  type Course,
  type CourseIndexDept,
  CourseIndexDeptSchema,
  type CourseIndexEntry,
  type CourseSearchFile,
  type CourseSearchRow,
  type DeptCode,
  SCHEMA_VERSIONS,
  type Term,
  type TermId,
} from "../schema";
import { parsePrerequisite } from "./prereqs";

// The course index (DATA.md §3.4) from per-term department chunks. The
// catalog job and mock mode both build it with these functions, so the
// fixtures' index is exactly what production would publish from them.

/** The parts of a catalog course the index keeps. */
export type CourseIndexSourceCourse = Pick<
  Course,
  | "code"
  | "title"
  | "credits"
  | "genEds"
  | "prerequisite"
  | "corequisite"
  | "restriction"
  | "crossListings"
>;

/** One term's chunk of a department. */
export interface CourseIndexSource {
  termId: TermId;
  courses: readonly CourseIndexSourceCourse[];
}

/**
 * The order terms feed the index: active terms newest first, then archived
 * ones newest first. A course's text comes from the first term that lists it,
 * so Testudo's current wording wins over an archived term's.
 */
export function courseIndexTermOrder(terms: readonly Term[]): TermId[] {
  const newestFirst = (a: Term, b: Term) => (a.id < b.id ? 1 : -1);
  return [
    ...terms.filter((t) => t.status === "active").sort(newestFirst),
    ...terms.filter((t) => t.status !== "active").sort(newestFirst),
  ].map((t) => t.id);
}

/**
 * One department's index file. `sources` are that department's chunks in
 * `courseIndexTermOrder`; each term a course appears in joins its `offered`.
 */
export function buildCourseIndexDept(
  dept: DeptCode,
  sources: readonly CourseIndexSource[],
): CourseIndexDept {
  const byCode = new Map<string, CourseIndexEntry>();
  for (const { termId, courses } of sources) {
    for (const course of courses) {
      if (!course.code.startsWith(dept)) continue;
      const known = byCode.get(course.code);
      if (known) {
        if (!known.offered.includes(termId)) known.offered.push(termId);
        continue;
      }
      byCode.set(course.code, {
        code: course.code,
        title: course.title,
        credits: { min: course.credits.min, max: course.credits.max },
        genEds: course.genEds.map((group) => group.map((o) => ({ ...o }))),
        prerequisite: course.prerequisite,
        corequisite: course.corequisite,
        restriction: course.restriction,
        crossListings: [...course.crossListings],
        prereqs: parsePrerequisite(course.prerequisite),
        offered: [termId],
      });
    }
  }
  const courses = [...byCode.values()]
    .map((entry) => ({
      ...entry,
      offered: [...entry.offered].sort((a, b) => (a < b ? 1 : -1)),
    }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  // Validated here so a bad chunk fails with where, not later in a reader.
  return CourseIndexDeptSchema.parse({
    schemaVersion: SCHEMA_VERSIONS.courses,
    dept,
    courses,
  });
}

/** A course's search row: `genEds` flattened to each code once, in order. */
export function courseSearchRow(entry: CourseIndexEntry): CourseSearchRow {
  const genEdCodes = [
    ...new Set(entry.genEds.flatMap((group) => group.map((o) => o.code))),
  ];
  return [
    entry.code,
    entry.title,
    entry.credits.min,
    entry.credits.max,
    genEdCodes,
  ];
}

/** The search file for every department's courses, sorted by code. */
export function buildCourseSearchFile(
  rows: readonly CourseSearchRow[],
): CourseSearchFile {
  return {
    schemaVersion: SCHEMA_VERSIONS.courses,
    courses: [...rows].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}
