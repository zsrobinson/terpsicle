import type { CourseCode, TermId } from "../schema";
import type {
  FourYearCourseEntry,
  FourYearDoc,
  FourYearEntry,
  FourYearTerm,
} from "../schema/four-year";
import { countsAsCode, type FourYearCourses } from "./course-lookup";
import { earnedNothing } from "./credits";
import { compareFourYearTerms, nextSemester, semesterIds } from "./terms";

// Prerequisite checks (docs/V3.md §2.8) on the course index's parsed groups.
// Information only: nothing blocks a move. Each group needs one of its codes
// (or a cross-listed equivalent) in an earlier column; a course's own term
// never counts. Placeholders satisfy nothing, and credit entries only what
// they're said to count as.

/** Whether a course in the plan meets a group: one of its codes, or cross-listed with one. */
export function meetsGroup(
  code: CourseCode,
  group: readonly CourseCode[],
  lookup: FourYearCourses,
): boolean {
  if (group.includes(code)) return true;
  const own = lookup.courses.get(code)?.crossListings ?? [];
  if (own.some((c) => group.includes(c))) return true;
  return group.some((g) =>
    (lookup.courses.get(g)?.crossListings ?? []).includes(code),
  );
}

/**
 * A course's prerequisite groups, without the course itself: Testudo's
 * "math eligibility of MATH140" is placement, and a course never meets its
 * own prerequisite. A group that was only the course asks for nothing.
 */
function prereqGroups(
  code: CourseCode,
  lookup: FourYearCourses,
): CourseCode[][] {
  return (lookup.courses.get(code)?.prereqs.groups ?? [])
    .map((group) => group.filter((c) => c !== code))
    .filter((group) => group.length > 0);
}

type Satisfier = { readonly entry: FourYearEntry; readonly code: CourseCode };

/**
 * Entries that can meet a prerequisite, as the course each counts as: every
 * course but ones whose grade earned nothing, and credit that counts as one.
 */
function satisfiers(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  lookup: FourYearCourses,
): Satisfier[] {
  return doc.entries.flatMap((entry) => {
    const code = countsAsCode(lookup, entry);
    return code === null || earnedNothing(doc, entry) ? [] : [{ entry, code }];
  });
}

/** The groups of an entry's prerequisites that no earlier column meets. */
export function unmetPrereqGroups(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  entry: FourYearCourseEntry,
  lookup: FourYearCourses,
): CourseCode[][] {
  const groups = prereqGroups(entry.code, lookup);
  if (groups.length === 0) return [];
  const earlier = satisfiers(doc, lookup).filter(
    (s) => compareFourYearTerms(s.entry.term, entry.term) < 0,
  );
  return groups.filter(
    (group) => !earlier.some((s) => meetsGroup(s.code, group, lookup)),
  );
}

/**
 * The first fall or spring where every group is met by an earlier column:
 * the semester after the latest of each group's earliest course. Null when
 * a group has no course in the plan at all.
 */
export function firstSemesterMeetingPrereqs(
  doc: Pick<FourYearDoc, "entries" | "grades" | "firstTermId">,
  entry: FourYearCourseEntry,
  lookup: FourYearCourses,
): TermId | null {
  const groups = prereqGroups(entry.code, lookup);
  const others = satisfiers(doc, lookup).filter(
    (s) => s.entry.id !== entry.id,
  );
  let latest: FourYearTerm = "before";
  for (const group of groups) {
    let earliest: FourYearTerm | null = null;
    for (const { entry: e, code } of others)
      if (
        meetsGroup(code, group, lookup) &&
        (earliest === null || compareFourYearTerms(e.term, earliest) < 0)
      )
        earliest = e.term;
    if (earliest === null) return null;
    if (compareFourYearTerms(earliest, latest) > 0) latest = earliest;
  }
  if (latest === "before") return semesterIds(doc.firstTermId, 1)[0] ?? null;
  return nextSemester(latest);
}
