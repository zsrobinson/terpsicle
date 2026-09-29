import { addGradeCounts, gradeSummary } from "../grades/grades";
import {
  type CourseCode,
  type DeptCode,
  type Instructor,
  type InstructorSlug,
  MOST_REVIEWED_MAX,
  MOST_TAKEN_MAX,
  type PlanetTerpDept,
  type PlanetTerpIndex,
  type PlanetTerpTotals,
  SCHEMA_VERSIONS,
} from "../schema";

// The PlanetTerp index (`planetterp/index.<hash>.json`): built by the nightly
// job from the department files it just wrote, and by the fixtures from
// theirs, so both agree.

/**
 * The index of these department files. `titles` names the courses offered
 * now; only they can be most taken.
 */
export function buildPlanetTerpIndex(
  depts: readonly PlanetTerpDept[],
  titles: ReadonlyMap<CourseCode, string>,
): PlanetTerpIndex {
  const instructors = new Map<InstructorSlug, [string, DeptCode[], number]>();
  const reviewed = new Map<InstructorSlug, Instructor>();
  const students = new Map<CourseCode, number>();
  for (const file of [...depts].sort((a, b) => (a.dept < b.dept ? -1 : 1))) {
    for (const [slug, instructor] of Object.entries(file.instructors)) {
      const entry = instructors.get(slug);
      if (entry) entry[1].push(file.dept);
      else
        instructors.set(slug, [
          instructor.name,
          [file.dept],
          instructor.reviewCount,
        ]);
      if (instructor.type === "professor" && instructor.reviewCount > 0)
        reviewed.set(slug, instructor);
    }
    for (const [code, grades] of Object.entries(file.courses))
      if (grades.all)
        students.set(code, gradeSummary(grades.all.counts).students);
  }
  return {
    schemaVersion: SCHEMA_VERSIONS.planetterp,
    instructors: Object.fromEntries(
      [...instructors].sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    mostTaken: [...students]
      .filter(([code, n]) => n > 0 && titles.has(code))
      .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
      .slice(0, MOST_TAKEN_MAX)
      .map(([code, n]) => [code, titles.get(code) ?? code, n]),
    mostReviewed: [...reviewed.values()]
      .sort(
        (a, b) => b.reviewCount - a.reviewCount || (a.slug < b.slug ? -1 : 1),
      )
      .slice(0, MOST_REVIEWED_MAX)
      .map((i) => [i.slug, i.name, i.reviewCount, i.rating]),
    totals: planetTerpTotals(depts),
  };
}

/**
 * What these department files hold in all: Reviews' front page counts up
 * to them. An instructor listed by several departments counts once; a
 * course's grades are its own department's.
 */
export function planetTerpTotals(
  depts: readonly PlanetTerpDept[],
): PlanetTerpTotals {
  const reviews = new Map<InstructorSlug, number>();
  const professors = new Set<InstructorSlug>();
  const courses = new Set<CourseCode>();
  const counts = [];
  for (const file of depts) {
    for (const [slug, instructor] of Object.entries(file.instructors)) {
      reviews.set(
        slug,
        Math.max(reviews.get(slug) ?? 0, instructor.reviewCount),
      );
      if (instructor.type === "professor") professors.add(slug);
    }
    for (const [code, grades] of Object.entries(file.courses))
      if (grades.all && !courses.has(code)) {
        courses.add(code);
        counts.push(grades.all.counts);
      }
  }
  const all = addGradeCounts(counts);
  return {
    courses: courses.size,
    professors: professors.size,
    reviews: [...reviews.values()].reduce((a, b) => a + b, 0),
    grades: all.reduce((a, b) => a + b, 0),
    counts: all,
  };
}
