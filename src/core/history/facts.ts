import type { CourseCode } from "~/core/schema";
import type { HistoryDept, HistoryOffering } from "~/core/schema/history";

// What the PlanetTerp job needs from a department's instructor history
// (docs/DATA.md §4.1): every course on record, so courses taught since
// Spring 2012 get grades and a place in the department file, and every name
// on record, so each is joined to its PlanetTerp slug once. Without the
// names, someone who taught a course only in a term Testudo no longer lists
// (Fawzi Emad in Spring 2025) had no entry in `names`, and a course page
// showed them twice: once by slug from the grades, once by name.

export interface HistoryDeptFacts {
  /** Every course on record, with its title when a term names it. */
  courses: Map<CourseCode, string | null>;
  /** Names as Testudo spells them (our own copies and umd.io's) → courses they taught. */
  testudoNames: Map<string, Set<CourseCode>>;
  /** Names as PlanetTerp spells them (the backfill) → courses they taught. */
  planetTerpNames: Map<string, Set<CourseCode>>;
  /** PlanetTerp's grade rows the history reflects (`planetTerpGradeRows`). */
  gradeRows: number;
}

export function historyDeptFacts(dept: HistoryDept): HistoryDeptFacts {
  const facts: HistoryDeptFacts = {
    courses: new Map(),
    testudoNames: new Map(),
    planetTerpNames: new Map(),
    gradeRows: 0,
  };
  for (const course of dept.courses) {
    facts.courses.set(course.code, course.title);
    for (const offering of course.offerings) {
      // umd.io copies Testudo, so its names are Testudo's spellings.
      const names =
        offering.source === "planetterp"
          ? facts.planetTerpNames
          : facts.testudoNames;
      for (const name of offering.instructors) {
        const set = names.get(name) ?? new Set<CourseCode>();
        set.add(course.code);
        names.set(name, set);
      }
      if (offering.source === "planetterp")
        facts.gradeRows += planetTerpGradeRows(offering);
    }
  }
  return facts;
}

/**
 * How many of PlanetTerp's grade rows a term of its backfill came from: a
 * row is one section's grades under one professor, so a section two taught
 * is two rows, a section with no professor one, and a professor whose
 * section didn't read at least one more. This is the unit of PlanetTerp's
 * "course grades" (checked against CMSC351's 84 rows).
 */
export function planetTerpGradeRows(offering: HistoryOffering): number {
  if (offering.source !== "planetterp") return 0;
  let rows = 0;
  const seated = new Set<string>();
  for (const section of offering.sections) {
    rows += Math.max(1, section.instructors.length);
    for (const name of section.instructors) seated.add(name);
  }
  for (const name of offering.instructors) if (!seated.has(name)) rows++;
  return rows;
}
