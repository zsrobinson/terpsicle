import { gradeSummary } from "../grades/grades";
import {
  type CourseCode,
  type DeptCode,
  type InstructorSlug,
  MOST_TAKEN_MAX,
  type PlanetTerpDept,
  type PlanetTerpIndex,
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
  const instructors = new Map<InstructorSlug, [string, DeptCode[]]>();
  const students = new Map<CourseCode, number>();
  for (const file of [...depts].sort((a, b) => (a.dept < b.dept ? -1 : 1))) {
    for (const [slug, instructor] of Object.entries(file.instructors)) {
      const entry = instructors.get(slug);
      if (entry) entry[1].push(file.dept);
      else instructors.set(slug, [instructor.name, [file.dept]]);
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
  };
}
