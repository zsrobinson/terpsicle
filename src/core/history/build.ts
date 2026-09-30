import type { Course, Credits, Section, TermId } from "~/core/schema";
import {
  CourseCodeSchema,
  InstructorNameSchema,
  SectionCodeSchema,
  TermIdSchema,
} from "~/core/schema";
import type { HistoryCourse, HistorySection } from "~/core/schema/history";

// The two ways a term's record is made (docs/DATA.md §3.5): from our own
// catalog's department chunks, and from PlanetTerp's grade rows (the
// backfill). Both give courses sorted by code with sorted, unique names.

/** Sorted and unique, the order every history list is kept in. */
export function sortedUnique<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort();
}

/** The fields a department chunk's course must have for the history. */
export type ChunkCourse = Pick<Course, "code" | "title" | "credits"> & {
  sections: readonly Pick<Section, "code" | "instructors">[];
};

/** One term's courses in a department chunk → its history record. */
export function historyCoursesFromChunk(
  courses: readonly ChunkCourse[],
): HistoryCourse[] {
  return courses
    .map((course) => {
      const sections = sortSections(
        course.sections.map((s) => ({
          code: s.code,
          instructors: sortedUnique(s.instructors.map((n) => n.trim())),
        })),
      );
      return {
        code: course.code,
        title: course.title,
        credits: { min: course.credits.min, max: course.credits.max },
        source: "terpsicle" as const,
        instructors: sortedUnique(sections.flatMap((s) => s.instructors)),
        sections,
      };
    })
    .sort((a, b) => compare(a.code, b.code));
}

/** A row of PlanetTerp's `/grades`: one section of one course in one term. */
export interface PlanetTerpGradeRow {
  course: string;
  professor: string | null;
  semester: string;
  section?: string | null;
}

/** What PlanetTerp's course listing says about a course. */
export interface PlanetTerpCourseMeta {
  title: string | null;
  credits: number | null;
}

/**
 * PlanetTerp writes some section numbers without their leading zeros
 * ("101"); Testudo's are always four characters ("0101"). Null when it
 * still isn't a section code.
 */
export function planetTerpSectionCode(raw: string | null | undefined) {
  const text = (raw ?? "").trim().toUpperCase();
  const padded = /^\d{1,3}$/.test(text) ? text.padStart(4, "0") : text;
  const parsed = SectionCodeSchema.safeParse(padded);
  return parsed.success ? parsed.data : null;
}

/**
 * One course's PlanetTerp grade rows → its record in each term they cover.
 * A row whose term or course code doesn't read is skipped; one with no
 * professor still records its section (as TBA); one whose section doesn't
 * read still records its professor, on the course.
 */
export function historyFromPlanetTerpGrades(
  rows: readonly PlanetTerpGradeRow[],
  meta: (code: string) => PlanetTerpCourseMeta | null,
): Map<TermId, HistoryCourse[]> {
  // term → course → (section → names, names without a section)
  const byTerm = new Map<
    TermId,
    Map<string, { sections: Map<string, Set<string>>; loose: Set<string> }>
  >();
  for (const row of rows) {
    const term = TermIdSchema.safeParse(row.semester.trim());
    const code = CourseCodeSchema.safeParse(row.course.trim().toUpperCase());
    if (!term.success || !code.success) continue;
    const name = InstructorNameSchema.safeParse(row.professor ?? "");
    const courses = byTerm.get(term.data) ?? new Map();
    byTerm.set(term.data, courses);
    const course = courses.get(code.data) ?? {
      sections: new Map<string, Set<string>>(),
      loose: new Set<string>(),
    };
    courses.set(code.data, course);
    const section = planetTerpSectionCode(row.section);
    if (section) {
      const names = course.sections.get(section) ?? new Set<string>();
      if (name.success) names.add(name.data);
      course.sections.set(section, names);
    } else if (name.success) {
      course.loose.add(name.data);
    }
  }
  const out = new Map<TermId, HistoryCourse[]>();
  for (const [termId, courses] of byTerm) {
    const list: HistoryCourse[] = [];
    for (const [code, { sections, loose }] of courses) {
      const info = meta(code);
      const recorded = sortSections(
        [...sections].map(([sectionCode, names]) => ({
          code: sectionCode,
          instructors: sortedUnique(names),
        })),
      );
      list.push({
        code,
        title: info?.title?.trim() ? info.title.trim().slice(0, 200) : null,
        credits: planetTerpCredits(info?.credits ?? null),
        source: "planetterp",
        instructors: sortedUnique([
          ...loose,
          ...recorded.flatMap((s) => s.instructors),
        ]),
        sections: recorded,
      });
    }
    out.set(
      termId,
      list.sort((a, b) => compare(a.code, b.code)),
    );
  }
  return out;
}

function planetTerpCredits(credits: number | null): Credits | null {
  return credits !== null &&
    Number.isFinite(credits) &&
    credits >= 0 &&
    credits <= 30
    ? { min: credits, max: credits }
    : null;
}

/** A section as umd.io's `/courses/sections` lists it (fields we read). */
export interface UmdioSectionRow {
  /** `CMSC131-0101`; the course code is before the hyphen. */
  section_id: string;
  semester: string;
  /** The section code, `0101`. */
  number: string | null;
  instructors: readonly string[];
}

/** What umd.io's `/courses/list` names a course, and its credits if known. */
export interface UmdioCourseMeta {
  title: string | null;
}

const TBA_INSTRUCTOR = /^(instructor:\s*)?tba$/i;

/**
 * One term's umd.io sections → its history records (`source: umdio`).
 * umd.io copies Testudo's Schedule of Classes, so names are Testudo's
 * spellings and every section is there, graded or not. A row from another
 * term, or whose course or section code doesn't read, is skipped; "TBA"
 * isn't a name. umd.io gives no credits.
 */
export function historyFromUmdioSections(
  termId: TermId,
  rows: readonly UmdioSectionRow[],
  meta: (code: string) => UmdioCourseMeta | null,
): HistoryCourse[] {
  const byCourse = new Map<string, Map<string, Set<string>>>();
  for (const row of rows) {
    if (row.semester.trim() !== termId) continue;
    const [rawCode, rawSection] = row.section_id.split("-");
    const code = CourseCodeSchema.safeParse(
      (rawCode ?? "").trim().toUpperCase(),
    );
    const section = SectionCodeSchema.safeParse(
      (row.number ?? rawSection ?? "").trim().toUpperCase(),
    );
    if (!code.success || !section.success) continue;
    const sections = byCourse.get(code.data) ?? new Map<string, Set<string>>();
    byCourse.set(code.data, sections);
    const names = sections.get(section.data) ?? new Set<string>();
    sections.set(section.data, names);
    for (const raw of row.instructors) {
      const name = InstructorNameSchema.safeParse(raw);
      if (name.success && !TBA_INSTRUCTOR.test(name.data)) names.add(name.data);
    }
  }
  return [...byCourse]
    .map(([code, sections]) => {
      const recorded = sortSections(
        [...sections].map(([sectionCode, names]) => ({
          code: sectionCode,
          instructors: sortedUnique(names),
        })),
      );
      const title = meta(code)?.title?.trim();
      return {
        code,
        title: title ? title.slice(0, 200) : null,
        credits: null,
        source: "umdio" as const,
        instructors: sortedUnique(recorded.flatMap((s) => s.instructors)),
        sections: recorded,
      };
    })
    .sort((a, b) => compare(a.code, b.code));
}

export function sortSections(sections: HistorySection[]): HistorySection[] {
  return sections.sort((a, b) => compare(a.code, b.code));
}

/** Code-unit order, the order `sortedUnique` and the schemas' refines use. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
