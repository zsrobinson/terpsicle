import { instructorNameKey, type TermId } from "~/core/schema";
import type {
  HistoryDept,
  HistoryOffering,
  HistorySource,
} from "~/core/schema/history";
import { compare } from "./build";

// Questions the history answers, over department files (docs/DATA.md §3.5).

/** Who taught `course` in `termId`: its record for that term, or null. */
export function whoTaught(
  dept: HistoryDept | null | undefined,
  course: string,
  termId: TermId,
): HistoryOffering | null {
  return (
    dept?.courses
      .find((c) => c.code === course)
      ?.offerings.find((o) => o.termId === termId) ?? null
  );
}

/** Every term of `course` on record, newest first (empty when none). */
export function courseOfferings(
  dept: HistoryDept | null | undefined,
  course: string,
): HistoryOffering[] {
  return dept?.courses.find((c) => c.code === course)?.offerings ?? [];
}

/** One course an instructor taught in one term. */
export interface TaughtRow {
  course: string;
  title: string | null;
  termId: TermId;
  source: HistorySource;
  /** Their sections, in order; empty when the source had no section for them. */
  sections: string[];
}

/**
 * What an instructor taught, newest term first, then by course. `names` are
 * every spelling of them to match (Testudo's and PlanetTerp's can differ),
 * compared with `instructorNameKey`; `depts` are the department files to
 * look in (the instructor's departments, from PlanetTerp's index).
 */
export function taughtBy(
  depts: readonly (HistoryDept | null | undefined)[],
  names: readonly string[],
): TaughtRow[] {
  const keys = new Set(names.map(instructorNameKey));
  const matches = (list: readonly string[]) =>
    list.some((n) => keys.has(instructorNameKey(n)));
  const rows: TaughtRow[] = [];
  const seen = new Set<string>();
  for (const dept of depts) {
    for (const course of dept?.courses ?? []) {
      for (const offering of course.offerings) {
        if (!matches(offering.instructors)) continue;
        const id = `${offering.termId}:${course.code}`;
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({
          course: course.code,
          title: course.title,
          termId: offering.termId,
          source: offering.source,
          sections: offering.sections
            .filter((s) => matches(s.instructors))
            .map((s) => s.code),
        });
      }
    }
  }
  return rows.sort(
    (a, b) => compare(b.termId, a.termId) || compare(a.course, b.course),
  );
}
