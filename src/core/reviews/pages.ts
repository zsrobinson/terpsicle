import { addGradeCounts, gradeSummary } from "../grades/grades";
import {
  type Course,
  type CourseCode,
  type CourseIndexEntry,
  type DeptCode,
  type GradeRecord,
  type InstructorId,
  type InstructorSlug,
  instructorNameKey,
  type PlanetTerpDept,
  type PlanetTerpSource,
  type Term,
  type TermId,
} from "../schema";

// What the public Reviews pages show before anyone signs in, built from the
// published files (and, on the server, Terpsicle's own numbers). Route
// loaders build these on the server and in the browser alike, so the server's
// HTML, its title and description, and the page after hydration agree.

/** Terpsicle's published reviews, summed (read from D1 on the server). */
export interface TerpsicleNumbers {
  rating: number;
  reviewCount: number;
}

/** A term as the pages name it. */
export interface PageTerm {
  id: TermId;
  name: string;
}

export interface CourseInstructorRow {
  /** Null: PlanetTerp doesn't know this Testudo name, so it has no id yet. */
  id: InstructorId | null;
  name: string;
  /** Teaching a section in `CoursePageData.term`. */
  teaching: boolean;
  /** PlanetTerp's numbers; null when PlanetTerp doesn't know them. */
  planetTerp: { rating: number | null; reviewCount: number } | null;
  /** Ours, every course; null when there are none (or Reviews is off). */
  terpsicle: TerpsicleNumbers | null;
  /** Their average GPA in this course, from PlanetTerp's grade data. */
  gpa: number | null;
  /**
   * Their average GPA across every course of theirs the department's file
   * has: how they grade, as PlanetTerp's course pages show it.
   */
  overallGpa: number | null;
  /** The newest term they taught it: this term when teaching, else PlanetTerp's newest. */
  lastTermId: TermId | null;
}

export interface CoursePageData {
  code: CourseCode;
  title: string | null;
  /** The term the scheduler would open, when it lists the course. */
  term: PageTerm | null;
  /** PlanetTerp's grades for everyone who's taught it. */
  grades: GradeRecord | null;
  gradesThrough: TermId | null;
  source: PlanetTerpSource | null;
  /** This term's instructors first, then the most-reviewed. */
  instructors: CourseInstructorRow[];
  /** Who taught it in each term, newest first: `courseTermGroups` reads it. */
  terms: CourseTerm[];
  /** Terpsicle's reviews of this course; null when unknown or none. */
  terpsicle: TerpsicleNumbers | null;
}

export interface CoursePageInput {
  code: CourseCode;
  /** The course index's entry (any term). */
  entry: CourseIndexEntry | null;
  /** The course in the term the scheduler would open. */
  current: { term: Term; course: Course | null } | null;
  ptDept: PlanetTerpDept | null;
  gradesThrough: TermId | null;
  source: PlanetTerpSource | null;
  terpsicle: TerpsicleNumbers | null;
  /**
   * The course's terms in our instructor history (~/core/history), newest
   * first: who taught it each term. Empty when the history has none.
   */
  offerings?: readonly TermInstructors[];
  /** Our numbers for each instructor (every course), when known. */
  ourNumbers?: Readonly<Record<InstructorId, TerpsicleNumbers>>;
}

/**
 * The course page, or null when nothing we publish has heard of the course
 * (the page is then a real 404).
 */
export function coursePageData(input: CoursePageInput): CoursePageData | null {
  const { code, entry, ptDept } = input;
  const course = input.current?.course ?? null;
  const grades = ptDept?.courses[code] ?? null;
  if (!entry && !course && !grades) return null;
  const currentTermId = course && input.current ? input.current.term.id : null;
  const offerings = input.offerings ?? [];
  const instructors = courseInstructorRows(
    code,
    course,
    ptDept,
    input.ourNumbers ?? {},
    currentTermId,
    offerings,
  );
  return {
    code,
    title: entry?.title ?? course?.title ?? null,
    term:
      course && input.current
        ? { id: input.current.term.id, name: input.current.term.name }
        : null,
    grades: grades?.all ?? null,
    gradesThrough: input.gradesThrough,
    source: input.source,
    instructors,
    terms: courseTerms(instructors, offerings, ptDept, currentTermId),
    terpsicle: input.terpsicle,
  };
}

/** Everyone who's taught the course: this term's first, then the most-reviewed. */
export function courseInstructorRows(
  code: CourseCode,
  current: Course | null,
  ptDept: PlanetTerpDept | null,
  ourNumbers: Readonly<Record<InstructorId, TerpsicleNumbers>> = {},
  currentTermId: TermId | null = null,
  offerings: readonly TermInstructors[] = [],
): CourseInstructorRow[] {
  const grades = ptDept?.courses[code] ?? null;
  const byKey = new Map<string, CourseInstructorRow>();
  for (const name of current?.sections.flatMap((s) => s.instructors) ?? []) {
    const id = ptDept?.names[instructorNameKey(name)] ?? null;
    const key = id ?? `name:${instructorNameKey(name)}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id,
      name,
      teaching: true,
      planetTerp: null,
      terpsicle: null,
      gpa: null,
      overallGpa: null,
      lastTermId: null,
    });
  }
  // Our history's names, newest term first: someone who taught it before
  // PlanetTerp's grades reach, or whose name PlanetTerp doesn't know.
  const historyTerm = new Map<string, TermId>();
  for (const offering of offerings)
    for (const name of offering.instructors) {
      const id = ptDept?.names[instructorNameKey(name)] ?? null;
      const key = id ?? `name:${instructorNameKey(name)}`;
      if (!historyTerm.has(key)) historyTerm.set(key, offering.termId);
      if (byKey.has(key)) continue;
      byKey.set(key, {
        id,
        name,
        teaching: false,
        planetTerp: null,
        terpsicle: null,
        gpa: null,
        overallGpa: null,
        lastTermId: null,
      });
    }
  for (const slug of Object.keys(grades?.byInstructor ?? {}))
    if (!byKey.has(slug))
      byKey.set(slug, {
        id: slug,
        name: ptDept?.instructors[slug]?.name ?? slug,
        teaching: false,
        planetTerp: null,
        terpsicle: null,
        gpa: null,
        overallGpa: null,
        lastTermId: null,
      });
  for (const [key, row] of byKey) {
    const pt = row.id ? ptDept?.instructors[row.id] : undefined;
    if (pt) {
      if (!row.teaching) row.name = pt.name;
      row.planetTerp = { rating: pt.rating, reviewCount: pt.reviewCount };
    }
    row.terpsicle = row.id ? (ourNumbers[row.id] ?? null) : null;
    const record = row.id ? grades?.byInstructor[row.id] : undefined;
    row.gpa = record ? gradeSummary(record.counts).averageGpa : null;
    const newest = [record?.latestTermId, historyTerm.get(key)]
      .filter((t) => t !== undefined)
      .sort((a, b) => b.localeCompare(a))[0];
    row.lastTermId =
      row.teaching && currentTermId ? currentTermId : (newest ?? null);
    row.overallGpa = row.id ? overallGpa(ptDept, row.id) : null;
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.teaching) - Number(a.teaching) ||
      (b.planetTerp?.reviewCount ?? 0) - (a.planetTerp?.reviewCount ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/** An instructor's average GPA over every course of theirs in a department's file. */
function overallGpa(
  ptDept: PlanetTerpDept | null,
  id: InstructorId,
): number | null {
  const all = Object.values(ptDept?.courses ?? {}).flatMap((c) => {
    const record = c.byInstructor[id];
    return record ? [record.counts] : [];
  });
  return all.length > 0 ? gradeSummary(addGradeCounts(all)).averageGpa : null;
}

/** Who taught a course in one term, as the instructor history has it. */
export interface TermInstructors {
  termId: TermId;
  /** Names as the source spells them. */
  instructors: readonly string[];
}

/** One term of `CoursePageData.terms`: who taught it then. */
export interface CourseTerm {
  /** Null for instructors with no term we or PlanetTerp know. */
  termId: TermId | null;
  /** Indexes into `instructors`, the most reviewed first. */
  rows: number[];
}

/** Who taught a course in one term: a group of `courseTermGroups`. */
export interface CourseTermGroup {
  termId: TermId | null;
  rows: CourseInstructorRow[];
}

/**
 * Who taught a course, term by term, newest first (owner, 2026-09-29:
 * PlanetTerp's course pages "group by term and show what professors taught
 * it"). Each term of our instructor history lists everyone who taught it
 * then, so an instructor appears under every term they taught. Whoever
 * teaches it now is under this term; anyone the history doesn't have (it
 * starts where PlanetTerp's grades and our copies of Testudo do) is under
 * the newest term PlanetTerp's grades know.
 */
function courseTerms(
  rows: readonly CourseInstructorRow[],
  offerings: readonly TermInstructors[],
  ptDept: PlanetTerpDept | null,
  currentTermId: TermId | null,
): CourseTerm[] {
  const indexOf = (name: string) => {
    const key = instructorNameKey(name);
    const id = ptDept?.names[key] ?? null;
    return rows.findIndex((r) =>
      id ? r.id === id : r.id === null && instructorNameKey(r.name) === key,
    );
  };
  const groups = new Map<TermId | null, Set<number>>();
  const add = (termId: TermId | null, i: number) => {
    const group = groups.get(termId) ?? new Set<number>();
    group.add(i);
    groups.set(termId, group);
  };
  const placed = new Set<number>();
  for (const offering of offerings)
    for (const name of offering.instructors) {
      const i = indexOf(name);
      if (i < 0) continue;
      add(offering.termId, i);
      placed.add(i);
    }
  rows.forEach((row, i) => {
    if (row.teaching && currentTermId) add(currentTermId, i);
    else if (!placed.has(i)) add(row.lastTermId, i);
  });
  const reviews = (i: number) => rows[i]?.planetTerp?.reviewCount ?? 0;
  const name = (i: number) => rows[i]?.name ?? "";
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b.localeCompare(a)))
    .map(([termId, group]) => ({
      termId,
      rows: [...group].sort(
        (a, b) => reviews(b) - reviews(a) || name(a).localeCompare(name(b)),
      ),
    }));
}

/** A course page's terms, each with its instructors' rows. */
export function courseTermGroups(
  data: Pick<CoursePageData, "instructors" | "terms">,
): CourseTermGroup[] {
  return data.terms.map((term) => ({
    termId: term.termId,
    rows: term.rows.flatMap((i) => {
      const row = data.instructors[i];
      return row ? [row] : [];
    }),
  }));
}

export interface InstructorCourse {
  code: CourseCode;
  /** PlanetTerp's grades for this instructor in the course. */
  grades: GradeRecord;
  students: number;
}

export interface InstructorPageData {
  id: InstructorId;
  /** Null when we can't tell from what's published (the page asks the API). */
  name: string | null;
  ta: boolean;
  /** Their PlanetTerp page's slug, when PlanetTerp knows them. */
  slug: InstructorSlug | null;
  planetTerp: { rating: number | null; reviewCount: number } | null;
  /** Departments whose PlanetTerp files list them. */
  depts: DeptCode[];
  /** Courses PlanetTerp has their grades for, most students first. */
  courses: InstructorCourse[];
  /** `?course=`, when it names a course. */
  course: CourseCode | null;
  gradesThrough: TermId | null;
  source: PlanetTerpSource | null;
  terpsicle: TerpsicleNumbers | null;
}

export interface InstructorPageInput {
  id: InstructorId;
  course: CourseCode | null;
  /** Every department file that lists them (or the course's, to look in). */
  ptDepts: readonly PlanetTerpDept[];
  /** Their name from our registry (minted ids, or a Testudo name). */
  registryName: string | null;
  gradesThrough: TermId | null;
  source: PlanetTerpSource | null;
  terpsicle: TerpsicleNumbers | null;
}

/** The instructor page, or null when no file and no registry knows them (a 404). */
export function instructorPageData(
  input: InstructorPageInput,
): InstructorPageData | null {
  const { id } = input;
  const listing = input.ptDepts.filter((d) => d.instructors[id]);
  const pt = listing[0]?.instructors[id] ?? null;
  if (!pt && input.registryName === null) return null;
  const courses = new Map<CourseCode, InstructorCourse>();
  for (const file of listing)
    for (const [code, grades] of Object.entries(file.courses)) {
      const record = grades.byInstructor[id];
      if (record && !courses.has(code))
        courses.set(code, {
          code,
          grades: record,
          students: gradeSummary(record.counts).students,
        });
    }
  return {
    id,
    name: pt?.name ?? input.registryName,
    ta: pt?.type === "ta",
    slug: pt?.slug ?? null,
    planetTerp: pt ? { rating: pt.rating, reviewCount: pt.reviewCount } : null,
    depts: listing.map((d) => d.dept),
    courses: [...courses.values()].sort(
      (a, b) => b.students - a.students || (a.code < b.code ? -1 : 1),
    ),
    course: input.course,
    gradesThrough: input.gradesThrough,
    source: input.source,
    terpsicle: input.terpsicle,
  };
}

/** What a visitor may have meant, on a page that couldn't be found. */
export type Suggestion =
  | { kind: "instructor"; id: InstructorId; label: string }
  | { kind: "course"; code: CourseCode; label: string };

/**
 * What the Worker reads from D1 for a server render (null while
 * REVIEWS_ENABLED is off). Nothing here carries an author.
 */
export interface ReviewsServerData {
  /** Published reviews of each instructor, every course. */
  instructorNumbers(
    ids: readonly InstructorId[],
  ): Promise<Readonly<Record<InstructorId, TerpsicleNumbers>>>;
  /** Published reviews of the course, every instructor. */
  courseNumbers(code: CourseCode): Promise<TerpsicleNumbers | null>;
  /** The registry's name and departments for an instructor, when it has them. */
  instructor(
    id: InstructorId,
  ): Promise<{ name: string; depts: DeptCode[] } | null>;
}
