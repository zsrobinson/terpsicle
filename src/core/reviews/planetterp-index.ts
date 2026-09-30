import { gradeSummary } from "../grades/grades";
import {
  type CourseCode,
  type DeptCode,
  GRADE_KEYS,
  type GradeCounts,
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
 * now; only they can be most taken. `whole` adds `totals`.
 */
export function buildPlanetTerpIndex(
  depts: readonly PlanetTerpDept[],
  titles: ReadonlyMap<CourseCode, string>,
  whole?: PlanetTerpWhole,
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
    ...(whole ? { totals: planetTerpTotals(depts, whole) } : {}),
  };
}

/** What only the whole of PlanetTerp's data can say, from the nightly job. */
export interface PlanetTerpWhole {
  /** Everyone its professor list names, professors and TAs. */
  professors: number;
  /** Their reviews, summed. */
  reviews: number;
  /** Its grade rows since Spring 2012, as our instructor history counts them. */
  gradeRows: number;
}

/**
 * What Reviews holds in all, counted the way PlanetTerp's front page counts
 * (DATA.md §4.1, "Totals"): professors and reviews over its whole list,
 * not only those our department files name, and grades as its rows. Courses
 * are ours: every course a department file lists.
 */
export function planetTerpTotals(
  depts: readonly PlanetTerpDept[],
  whole: PlanetTerpWhole,
): PlanetTerpTotals {
  const courses = new Set<CourseCode>();
  const counts = GRADE_KEYS.map(() => 0) as GradeCounts;
  for (const file of depts)
    for (const [code, grades] of Object.entries(file.courses)) {
      if (courses.has(code)) continue;
      courses.add(code);
      grades.all?.counts.forEach((n, i) => {
        counts[i] = (counts[i] ?? 0) + n;
      });
    }
  return {
    courses: courses.size,
    professors: whole.professors,
    reviews: whole.reviews,
    grades: whole.gradeRows,
    counts,
  };
}
