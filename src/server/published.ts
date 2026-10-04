// What the jobs publish to R2 `DATA` (DATA.md §2), as the Worker reads it:
// one JSON file by key, checked against its schema, and the catalog lookups
// the Worker's areas share (Chat's course, a watched section, a term's
// calendar, the seats, a PlanetTerp department). A missing file, or one that
// doesn't match its schema, reads as null; a body that isn't JSON throws.
import type { z } from "zod";
import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  type Course,
  type CourseCode,
  calendarKey,
  DeptChunkSchema,
  type DeptCode,
  deptChunkKey,
  ManifestSchema,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  parseSectionKey,
  planetTerpDeptKey,
  SeatsFileSchema,
  type Section,
  seatsKey,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";

/** A published file's JSON by key, or null when there's no such file. */
export type ReadJson = (key: string) => Promise<unknown>;

/** Where published files come from: the bucket itself, or a reader over it (`memoJson`). */
export type Published = R2Bucket | ReadJson;

/** Reads `DATA` directly: every call is a fresh get. */
export function r2Json(bucket: R2Bucket): ReadJson {
  return async (key) => {
    const object = await bucket.get(key);
    return object ? object.json() : null;
  };
}

/**
 * Reads each key once: a cron run or a calendar feed looks up many sections
 * in the same few files. For one run or request, never an isolate.
 */
export function memoJson(bucket: R2Bucket): ReadJson {
  const read = r2Json(bucket);
  const cache = new Map<string, Promise<unknown>>();
  return (key) => {
    let value = cache.get(key);
    if (!value) {
      value = read(key);
      cache.set(key, value);
    }
    return value;
  };
}

const readerOf = (from: Published): ReadJson =>
  typeof from === "function" ? from : r2Json(from);

/** `key`, checked against `schema`; null when it's missing or doesn't match. */
export async function readPublished<S extends z.ZodType>(
  from: Published,
  key: string,
  schema: S,
): Promise<z.output<S> | null> {
  const parsed = schema.safeParse(await readerOf(from)(key));
  return parsed.success ? parsed.data : null;
}

// ---------- the catalog ----------

/** The term as terms.json lists it, or null when Testudo never had it. */
export async function findTerm(
  from: Published,
  termId: TermId,
): Promise<Term | null> {
  const terms = await readPublished(from, TERMS_KEY, TermsFileSchema);
  return terms?.terms.find((t) => t.id === termId) ?? null;
}

/** A course of a term, from its department's current file; null when the catalog doesn't have it. */
export async function findCourse(
  from: Published,
  termId: TermId,
  courseCode: CourseCode,
): Promise<Course | null> {
  const read = readerOf(from);
  const manifest = await readPublished(
    read,
    manifestKey(termId),
    ManifestSchema,
  );
  const dept = courseCode.slice(0, 4);
  const entry = manifest?.departments.find((d) => d.code === dept);
  if (!entry) return null;
  const chunk = await readPublished(
    read,
    deptChunkKey(termId, dept, entry.hash),
    DeptChunkSchema,
  );
  return chunk?.courses.find((c) => c.code === courseCode) ?? null;
}

export interface WatchedSection {
  term: Term;
  course: Course;
  section: Section;
}

/** A section by its key (`CMSC351-0101`), with its term and course; null when any of them is gone. */
export async function findSection(
  from: Published,
  termId: string,
  sectionKey: string,
): Promise<WatchedSection | null> {
  const parsedKey = parseSectionKey(sectionKey);
  if (!parsedKey) return null;
  const read = readerOf(from);
  const term = await findTerm(read, termId);
  if (!term) return null;
  const course = await findCourse(read, term.id, parsedKey.courseCode);
  const section = course?.sections.find(
    (s) => s.code === parsedKey.sectionCode,
  );
  return course && section ? { term, course, section } : null;
}

/** The term's academic calendar, or null before the provost publishes it. */
export function readCalendar(
  from: Published,
  termId: TermId,
): Promise<AcademicCalendar | null> {
  return readPublished(from, calendarKey(termId), AcademicCalendarSchema);
}

/** Open seats for a section right now, from the published seats file. */
export async function currentOpenSeats(
  from: Published,
  termId: string,
  sectionKey: string,
): Promise<number | null> {
  const read = readerOf(from);
  const manifest = await readPublished(
    read,
    manifestKey(termId),
    ManifestSchema,
  );
  if (!manifest?.seats) return null;
  const seats = await readPublished(
    read,
    seatsKey(termId, manifest.seats.hash),
    SeatsFileSchema,
  );
  return seats?.seats[sectionKey]?.[0] ?? null;
}

// ---------- PlanetTerp ----------

/**
 * The department's current PlanetTerp file (DATA.md §4.1): Reviews joins
 * Testudo names to slugs with its `names` map. Null when there's none.
 */
export async function readPlanetTerpDept(
  from: Published,
  dept: DeptCode,
): Promise<PlanetTerpDept | null> {
  const read = readerOf(from);
  const manifest = await readPublished(
    read,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
  );
  const entry = manifest?.departments.find((d) => d.code === dept);
  if (!entry) return null;
  return readPublished(
    read,
    planetTerpDeptKey(dept, entry.hash),
    PlanetTerpDeptSchema,
  );
}
