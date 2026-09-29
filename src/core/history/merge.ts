import { SCHEMA_VERSIONS, type TermId } from "~/core/schema";
import type {
  HistoryCourse,
  HistoryDept,
  HistoryDeptCourse,
  HistorySection,
  HistorySource,
  HistoryTerm,
} from "~/core/schema/history";
import { compare, sortedUnique, sortSections } from "./build";

// How a new sighting of a term joins the record (docs/DATA.md §3.5):
// - a course is never dropped: a term only gains courses;
// - our own record beats PlanetTerp's, whichever arrives first;
// - from the same source, the newer sighting's sections win (a section
//   Testudo stopped listing was cancelled), but a section's names never
//   go back to TBA: a name we saw is kept over an empty list.

/** A course's record after a new sighting of it. */
export function mergeHistoryCourse(
  existing: HistoryCourse | undefined,
  incoming: HistoryCourse,
): HistoryCourse {
  if (!existing) return incoming;
  if (outranks(existing.source, incoming.source)) return existing;
  if (outranks(incoming.source, existing.source)) return incoming;
  const before = new Map(existing.sections.map((s) => [s.code, s]));
  const sections: HistorySection[] = sortSections(
    incoming.sections.map((s) => {
      const kept = before.get(s.code);
      return s.instructors.length === 0 && kept && kept.instructors.length > 0
        ? { code: s.code, instructors: kept.instructors }
        : s;
    }),
  );
  return {
    code: incoming.code,
    title: incoming.title ?? existing.title,
    credits: incoming.credits ?? existing.credits,
    source: incoming.source,
    instructors: sortedUnique([
      ...incoming.instructors,
      ...sections.flatMap((s) => s.instructors),
    ]),
    sections,
  };
}

/** Our own record outranks PlanetTerp's. */
function outranks(a: HistorySource, b: HistorySource): boolean {
  return a === "terpsicle" && b === "planetterp";
}

/** A term's record after new sightings of some of its courses. */
export function mergeHistoryTerm(
  existing: HistoryTerm | null,
  termId: TermId,
  incoming: readonly HistoryCourse[],
): HistoryTerm {
  const courses = new Map(
    (existing?.courses ?? []).map((c) => [c.code, c] as const),
  );
  for (const course of incoming)
    courses.set(
      course.code,
      mergeHistoryCourse(courses.get(course.code), course),
    );
  return {
    schemaVersion: SCHEMA_VERSIONS.history,
    termId,
    courses: [...courses.values()].sort((a, b) => compare(a.code, b.code)),
  };
}

/** Courses recorded from each source, for the manifest. */
export function historySourceCounts(
  term: HistoryTerm,
): Record<HistorySource, number> {
  const counts = { terpsicle: 0, planetterp: 0 };
  for (const course of term.courses) counts[course.source]++;
  return counts;
}

/**
 * A department file with one term's courses replaced by `courses` (that
 * term's record, this department's courses only). Other terms stay as they
 * were. The title follows the newest term that names the course. Null when
 * the department is left with nothing.
 */
export function patchHistoryDept(
  existing: HistoryDept | null,
  dept: string,
  termId: TermId,
  courses: readonly HistoryCourse[],
): HistoryDept | null {
  const byCode = new Map<string, HistoryDeptCourse>();
  for (const course of existing?.courses ?? []) {
    const offerings = course.offerings.filter((o) => o.termId !== termId);
    if (offerings.length > 0) byCode.set(course.code, { ...course, offerings });
  }
  for (const course of courses) {
    if (!course.code.startsWith(dept)) continue;
    const before = byCode.get(course.code);
    const offerings = [
      ...(before?.offerings ?? []),
      {
        termId,
        source: course.source,
        instructors: course.instructors,
        sections: course.sections,
      },
    ].sort((a, b) => compare(b.termId, a.termId));
    const newest = offerings[0]?.termId === termId;
    byCode.set(course.code, {
      code: course.code,
      title:
        newest && course.title !== null
          ? course.title
          : (before?.title ?? course.title),
      offerings,
    });
  }
  if (byCode.size === 0) return null;
  return {
    schemaVersion: SCHEMA_VERSIONS.history,
    dept,
    courses: [...byCode.values()].sort((a, b) => compare(a.code, b.code)),
  };
}
