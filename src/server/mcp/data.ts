// What the MCP server reads (docs/MCP.md): the files the jobs publish to R2
// `DATA` (DATA.md §2), checked against their schemas. Everything here is
// public: it's what /data serves.
//
// Hashed files never change once written (DATA.md §2.2), so each isolate
// keeps the checked values of the ones it has read, up to a bound, like
// `r2PublishedFiles` (src/server/pages/context.ts) keeps raw ones: an
// agent's calls come in runs, and the big files (the course index's search
// rows, the offered file) cost far more to parse and check against their
// schemas than to fetch. That's why this keeps checked values rather than
// sharing r2PublishedFiles' raw JSON. The Worker has no TanStack Query.
import type { z } from "zod";
import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  BuildingsFileSchema,
  buildingsKey,
  COURSE_INDEX_MANIFEST_KEY,
  type Course,
  type CourseCode,
  type CourseIndexDept,
  CourseIndexDeptSchema,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  type CourseSearchRow,
  calendarKey,
  courseIndexDeptKey,
  courseSearchKey,
  DeptChunkSchema,
  type DeptCode,
  deptChunkKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  type Manifest,
  ManifestSchema,
  manifestKey,
  OFFERED_MANIFEST_KEY,
  offeredKey,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  PlanetTerpDeptSchema,
  type PlanetTerpIndex,
  PlanetTerpIndexSchema,
  type PlanetTerpManifest,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
  planetTerpIndexKey,
  routesKey,
  SeatsFileSchema,
  seatsKey,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";
import {
  type HistoryDept,
  HistoryDeptSchema,
  type HistoryManifest,
  HistoryManifestSchema,
  type HistoryOffered,
  HistoryOfferedManifestSchema,
  HistoryOfferedSchema,
} from "~/core/schema/history";
import type { SeatsMap } from "~/core/seats";
import { campusMoment } from "~/core/time/format";
import { type CampusMap, campusMap, EMPTY_CAMPUS } from "~/core/travel";
import { decodeRoutes } from "~/core/travel/routes-binary";
import { r2Json } from "../published";

/** Content-hashed: never changes once written (DATA.md §2.2). */
const HASHED = /\.[0-9a-f]{16}\.(json|bin)$/;
/**
 * The few files most calls start from, each hundreds of KB to parse and
 * check: the course index's search rows, the offered file, PlanetTerp's
 * index and the routes. Kept apart, so a broad search's department files
 * never push them out.
 */
const INDEX_FILE =
  /^(courses\/search|offered\/courses|planetterp\/index|geo\/)/;
/** Department files an isolate keeps: one broad search's worth (MAX_SEARCH_DEPTS). */
const MAX_FILES = 48;
/** Index files and what's derived from them (two of each, across a republish). */
const MAX_INDEX = 12;

const files = new Map<string, unknown>();
const indexFiles = new Map<string, unknown>();

/** Forget everything (tests). */
export function clearPublishedCache(): void {
  files.clear();
  indexFiles.clear();
}

/** The kept value for `key`, newest last, or undefined. */
function keptValue(key: string): unknown {
  const pool = INDEX_FILE.test(key) ? indexFiles : files;
  if (!pool.has(key)) return undefined;
  const value = pool.get(key);
  pool.delete(key);
  pool.set(key, value);
  return value;
}

function keep(key: string, value: unknown): void {
  const [pool, max] = INDEX_FILE.test(key)
    ? [indexFiles, MAX_INDEX]
    : [files, MAX_FILES];
  pool.set(key, value);
  for (const oldest of pool.keys()) {
    if (pool.size <= max) break;
    pool.delete(oldest);
  }
}

export type McpData = ReturnType<typeof mcpData>;

/**
 * The published data for one request, read from `bucket`. A read in
 * flight is shared only within the request (workerd won't let another
 * request wait on it, src/server/pages/context.ts); across requests, an
 * isolate keeps hashed files' settled, checked values, and what's derived
 * from them, since neither ever changes. Fixed-name files (the term list,
 * manifests) are read fresh each request: they're small, and they say
 * which hashed files are current.
 */
export function mcpData(bucket: R2Bucket) {
  const inFlight = new Map<string, Promise<unknown>>();

  function once<T>(key: string, load: () => Promise<T>): Promise<T> {
    const kept = HASHED.test(key.replace(/#.*$/, ""))
      ? keptValue(key)
      : undefined;
    if (kept !== undefined) return Promise.resolve(kept as T);
    let value = inFlight.get(key) as Promise<T> | undefined;
    if (!value) {
      value = load().then((v) => {
        // A missing or unreadable file isn't kept: the next call tries again.
        if (v !== null && HASHED.test(key.replace(/#.*$/, ""))) keep(key, v);
        return v;
      });
      inFlight.set(key, value);
    }
    return value;
  }

  function read<S extends z.ZodType>(
    key: string,
    schema: S,
  ): Promise<z.output<S> | null> {
    return once(key, async () => {
      const parsed = schema.safeParse(await r2Json(bucket)(key));
      return parsed.success ? parsed.data : null;
    });
  }

  /** A value derived from hashed file `key` (a search index, a decoded binary), kept beside it. */
  function derive<T>(key: string, load: () => Promise<T>): Promise<T> {
    return once(`${key}#derived`, load);
  }

  async function terms(): Promise<Term[]> {
    return (await read(TERMS_KEY, TermsFileSchema))?.terms ?? [];
  }

  function manifest(termId: TermId): Promise<Manifest | null> {
    return read(manifestKey(termId), ManifestSchema);
  }

  async function deptCourses(
    termId: TermId,
    dept: DeptCode,
  ): Promise<Course[] | null> {
    const m = await manifest(termId);
    const entry = m?.departments.find((d) => d.code === dept);
    if (!entry) return m ? [] : null;
    const chunk = await read(
      deptChunkKey(termId, dept, entry.hash),
      DeptChunkSchema,
    );
    return chunk?.courses ?? null;
  }

  async function course(
    termId: TermId,
    code: CourseCode,
  ): Promise<Course | null> {
    const courses = await deptCourses(termId, code.slice(0, 4));
    return courses?.find((c) => c.code === code) ?? null;
  }

  async function seats(termId: TermId): Promise<SeatsMap | null> {
    const m = await manifest(termId);
    if (!m?.seats) return null;
    const file = await read(seatsKey(termId, m.seats.hash), SeatsFileSchema);
    return file?.seats ?? null;
  }

  /**
   * When a term's seat counts are from: Testudo's own "Open Seats as of"
   * stamp, else when we last fetched them (DATA.md §3.2). Null before the
   * first seats run.
   */
  async function seatCountsTime(
    termId: TermId,
  ): Promise<{ asOf: string; asOfUtc: string } | null> {
    const m = await manifest(termId);
    const at = m?.seats ? (m.seats.asOf ?? m.seats.fetchedAt) : null;
    return at ? { asOf: campusMoment(at), asOfUtc: at } : null;
  }

  async function courseSearchRows(): Promise<{
    hash: string;
    rows: CourseSearchRow[];
  } | null> {
    const m = await read(COURSE_INDEX_MANIFEST_KEY, CourseIndexManifestSchema);
    if (!m) return null;
    const file = await read(
      courseSearchKey(m.search.hash),
      CourseSearchFileSchema,
    );
    return file ? { hash: m.search.hash, rows: file.courses } : null;
  }

  async function courseIndexDept(
    dept: DeptCode,
  ): Promise<CourseIndexDept | null> {
    const m = await read(COURSE_INDEX_MANIFEST_KEY, CourseIndexManifestSchema);
    const entry = m?.departments.find((d) => d.code === dept);
    if (!entry) return null;
    return read(courseIndexDeptKey(dept, entry.hash), CourseIndexDeptSchema);
  }

  function historyManifest(): Promise<HistoryManifest | null> {
    return read(HISTORY_MANIFEST_KEY, HistoryManifestSchema);
  }

  async function historyDept(dept: DeptCode): Promise<HistoryDept | null> {
    const m = await historyManifest();
    const entry = m?.departments.find((d) => d.code === dept);
    if (!entry) return null;
    return read(historyDeptKey(dept, entry.hash), HistoryDeptSchema);
  }

  async function offered(): Promise<{
    hash: string;
    file: HistoryOffered;
  } | null> {
    const m = await read(OFFERED_MANIFEST_KEY, HistoryOfferedManifestSchema);
    if (!m) return null;
    const file = await read(offeredKey(m.hash), HistoryOfferedSchema);
    return file ? { hash: m.hash, file } : null;
  }

  function planetTerpManifest(): Promise<PlanetTerpManifest | null> {
    return read(PLANETTERP_MANIFEST_KEY, PlanetTerpManifestSchema);
  }

  async function planetTerpDept(
    dept: DeptCode,
  ): Promise<PlanetTerpDept | null> {
    const m = await planetTerpManifest();
    const entry = m?.departments.find((d) => d.code === dept);
    if (!entry) return null;
    return read(planetTerpDeptKey(dept, entry.hash), PlanetTerpDeptSchema);
  }

  async function planetTerpIndex(): Promise<{
    hash: string;
    index: PlanetTerpIndex;
  } | null> {
    const m = await planetTerpManifest();
    if (!m?.index) return null;
    const index = await read(
      planetTerpIndexKey(m.index.hash),
      PlanetTerpIndexSchema,
    );
    return index ? { hash: m.index.hash, index } : null;
  }

  function calendar(termId: TermId): Promise<AcademicCalendar | null> {
    return read(calendarKey(termId), AcademicCalendarSchema);
  }

  /** Walking distances between buildings and the off-campus codes; empty when the geo files won't read. */
  async function campus(): Promise<CampusMap> {
    const m = await read(GEO_MANIFEST_KEY, GeoManifestSchema);
    if (!m) return EMPTY_CAMPUS;
    const buildings = await read(
      buildingsKey(m.buildings.hash),
      BuildingsFileSchema,
    );
    const routes = m.routes;
    const table = routes
      ? await derive(routesKey(routes.hash), async () => {
          const object = await bucket.get(routesKey(routes.hash));
          if (!object) return null;
          try {
            return decodeRoutes(await object.arrayBuffer());
          } catch {
            return null;
          }
        })
      : null;
    return campusMap(table, buildings);
  }

  return {
    terms,
    manifest,
    deptCourses,
    course,
    seats,
    seatCountsTime,
    courseSearchRows,
    courseIndexDept,
    historyManifest,
    historyDept,
    offered,
    planetTerpManifest,
    planetTerpDept,
    planetTerpIndex,
    calendar,
    campus,
    derive,
  };
}
