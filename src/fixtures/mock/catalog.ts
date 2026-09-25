// The mock catalog: real Testudo data for the departments the recon saved
// (derived/, see scripts/derive-mock-catalog.ts) plus the prototype's courses
// for departments it didn't (hand-courses.ts). Shapes are exactly what ingest
// publishes: one `DeptChunk` per department.
import { z } from "zod";
import {
  type Course,
  CourseSchema,
  type DeptChunk,
  DeptChunkSchema,
  DeptCodeSchema,
  parseSectionKey,
  type SeatTuple,
  SeatTupleSchema,
  type Section,
  SectionKeySchema,
  type TermId,
  TermIdSchema,
} from "~/core/schema";
import { archivedFixtureTermId, fixtureTermId } from "../builders";
import soc202605 from "./derived/soc-202605.json";
import soc202701 from "./derived/soc-202701.json";
import { handCourses } from "./hand-courses";

const DerivedSocSchema = z.object({
  termId: TermIdSchema,
  departments: z.array(
    z.object({
      code: DeptCodeSchema,
      name: z.string().min(1),
      courses: z.array(CourseSchema),
    }),
  ),
  /** Real counts as Testudo showed them (registration closed: open = total). */
  seats: z.record(SectionKeySchema, SeatTupleSchema),
});

/**
 * Cancelled since the demo plan B placed it: gone from the catalog, listed in
 * the changes file. (Real section, removed here on purpose.)
 */
export const CANCELLED_SECTION_KEY = "CMSC320-0301";
/** Moved since plan B placed it: the catalog has the real (new) times. */
export const MOVED_SECTION_KEY = "AAAS100-0501";

type MockDepartment = { code: string; name: string; courses: Course[] };

function buildTerm(
  source: unknown,
  extra: Record<string, { name: string; courses: Course[] }>,
  cancelled: readonly string[],
) {
  const derived = DerivedSocSchema.parse(source);
  const byCode = new Map<string, MockDepartment>(
    derived.departments.map((d) => [d.code, { ...d, courses: [...d.courses] }]),
  );
  for (const [code, dept] of Object.entries(extra)) {
    const existing = byCode.get(code);
    if (existing) existing.courses.push(...dept.courses);
    else
      byCode.set(code, { code, name: dept.name, courses: [...dept.courses] });
  }
  const gone = new Set(cancelled);
  const removed: Record<string, Section> = {};
  for (const d of byCode.values())
    for (const c of d.courses)
      for (const s of c.sections)
        if (gone.has(`${c.code}-${s.code}`)) removed[`${c.code}-${s.code}`] = s;
  const departments = [...byCode.values()]
    .map((d) => ({
      ...d,
      courses: d.courses
        .map((c) => ({
          ...c,
          sections: c.sections.filter((s) => !gone.has(`${c.code}-${s.code}`)),
        }))
        .sort((a, b) => (a.code < b.code ? -1 : 1)),
    }))
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  const chunks = departments.map(
    (d): DeptChunk =>
      DeptChunkSchema.parse({
        schemaVersion: 1,
        termId: derived.termId,
        dept: d.code,
        courses: d.courses,
      }),
  );
  const names = Object.fromEntries(departments.map((d) => [d.code, d.name]));
  return {
    chunks,
    names,
    removed,
    testudoSeats: derived.seats as Record<string, SeatTuple>,
  };
}

const spring = buildTerm(soc202701, handCourses, [CANCELLED_SECTION_KEY]);
const summer = buildTerm(soc202605, {}, []);

/** Every mock department chunk, by term. */
export const mockCatalog: Readonly<Record<TermId, readonly DeptChunk[]>> = {
  [fixtureTermId]: spring.chunks,
  [archivedFixtureTermId]: summer.chunks,
};

/** Testudo's department names ("Computer Science"), by term then code. */
export const mockDepartmentNames: Readonly<
  Record<TermId, Readonly<Record<string, string>>>
> = {
  [fixtureTermId]: spring.names,
  [archivedFixtureTermId]: summer.names,
};

/** Seat counts exactly as the recon captured them, by term (before mock seats are applied). */
export const testudoSeats: Readonly<
  Record<TermId, Readonly<Record<string, SeatTuple>>>
> = {
  [fixtureTermId]: spring.testudoSeats,
  [archivedFixtureTermId]: summer.testudoSeats,
};

/** Sections taken out of the catalog on purpose (see `CANCELLED_SECTION_KEY`), as they were. */
export const removedSections: Readonly<Record<string, Section>> =
  spring.removed;

export function mockCourses(termId: TermId = fixtureTermId): Course[] {
  return (mockCatalog[termId] ?? []).flatMap((chunk) => chunk.courses);
}

/** A course from the mock catalog; throws when it isn't there, so tests fail loudly. */
export function mockCourse(
  code: string,
  termId: TermId = fixtureTermId,
): Course {
  const course = mockCourses(termId).find((c) => c.code === code);
  if (!course) throw new Error(`No mock course ${code} in ${termId}`);
  return course;
}

/** A section from the mock catalog by key ("CMSC351-0101"); throws when missing. */
export function mockSection(
  key: string,
  termId: TermId = fixtureTermId,
): Section {
  const parsed = parseSectionKey(key);
  const section = parsed
    ? mockCourse(parsed.courseCode, termId).sections.find(
        (s) => s.code === parsed.sectionCode,
      )
    : undefined;
  if (!section) throw new Error(`No mock section ${key} in ${termId}`);
  return section;
}
