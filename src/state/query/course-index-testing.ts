// Test helpers for the course index's queries. Not used by the app.
import { courseSearchRow } from "~/core/catalog/course-index";
import {
  COURSE_INDEX_MANIFEST_KEY,
  type CourseIndexEntry,
  courseIndexDeptKey,
  courseSearchKey,
} from "~/core/schema";
import {
  aCourseIndexDept,
  aCourseIndexManifest,
  aCourseSearchFile,
  FIXTURE_HASH,
} from "~/fixtures";
import { createMemoryDataSource, type DataSource } from "../data-source";

/**
 * Published files for a course index of just these courses (the search
 * file and each one's department), for a test to `connectPublished`. A
 * department none of them is in isn't in the index.
 */
export function courseIndexSource(
  courses: readonly CourseIndexEntry[],
): DataSource {
  const depts = new Map<string, CourseIndexEntry[]>();
  for (const c of courses)
    depts.set(c.code.slice(0, 4), [
      ...(depts.get(c.code.slice(0, 4)) ?? []),
      c,
    ]);
  return createMemoryDataSource({
    [COURSE_INDEX_MANIFEST_KEY]: aCourseIndexManifest({
      departments: [...depts.keys()]
        .sort()
        .map((code) => ({ code, hash: FIXTURE_HASH })),
    }),
    [courseSearchKey(FIXTURE_HASH)]: aCourseSearchFile({
      // The file's rows are sorted by code, as the job writes them.
      courses: [...courses]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(courseSearchRow),
    }),
    ...Object.fromEntries(
      [...depts].map(([dept, list]) => [
        courseIndexDeptKey(dept, FIXTURE_HASH),
        aCourseIndexDept({
          dept,
          courses: [...list].sort((a, b) => a.code.localeCompare(b.code)),
        }),
      ]),
    ),
  });
}
