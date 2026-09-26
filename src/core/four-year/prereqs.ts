import type { CourseCode, TermId } from "../schema";
import type {
  FourYearCourseEntry,
  FourYearDoc,
  FourYearTerm,
} from "../schema/four-year";
import type { FourYearCourses } from "./course-lookup";
import { earnedNothing } from "./credits";
import { compareFourYearTerms, nextSemester, semesterIds } from "./terms";

// Prerequisite checks (docs/V3.md §2.8) on the course index's parsed groups.
// Information only: nothing blocks a move. Each group needs one of its codes
// (or a cross-listed equivalent) in an earlier column; a course's own term
// never counts, and placeholders and credit entries satisfy nothing.

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

/** Course entries that can meet a prerequisite: all but ones whose grade earned nothing. */
function satisfiers(
  doc: Pick<FourYearDoc, "entries" | "grades">,
): FourYearCourseEntry[] {
  return doc.entries.filter(
    (e): e is FourYearCourseEntry =>
      e.kind === "course" && !earnedNothing(doc, e),
  );
}

/** The groups of an entry's prerequisites that no earlier column meets. */
export function unmetPrereqGroups(
  doc: Pick<FourYearDoc, "entries" | "grades">,
  entry: FourYearCourseEntry,
  lookup: FourYearCourses,
): CourseCode[][] {
  const groups = lookup.courses.get(entry.code)?.prereqs.groups ?? [];
  if (groups.length === 0) return [];
  const earlier = satisfiers(doc).filter(
    (e) => compareFourYearTerms(e.term, entry.term) < 0,
  );
  return groups.filter(
    (group) => !earlier.some((e) => meetsGroup(e.code, group, lookup)),
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
  const groups = lookup.courses.get(entry.code)?.prereqs.groups ?? [];
  const others = satisfiers(doc).filter((e) => e.id !== entry.id);
  let latest: FourYearTerm = "before";
  for (const group of groups) {
    let earliest: FourYearTerm | null = null;
    for (const e of others)
      if (
        meetsGroup(e.code, group, lookup) &&
        (earliest === null || compareFourYearTerms(e.term, earliest) < 0)
      )
        earliest = e.term;
    if (earliest === null) return null;
    if (compareFourYearTerms(earliest, latest) > 0) latest = earliest;
  }
  if (latest === "before") return semesterIds(doc.firstTermId, 1)[0] ?? null;
  return nextSemester(latest);
}
