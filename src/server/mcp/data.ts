// What the MCP server reads (docs/MCP.md): the files the jobs publish to R2
// `DATA` (DATA.md §2), checked against their schemas. Everything here is
// public: it's what /data serves.
//
// Hashed files never change once written (DATA.md §2.2), so each isolate
// keeps the ones it has parsed, up to a bound: an agent's calls come in
// runs, and the big files (the course index's search rows, the offered
// file, a department's history) cost far more to parse and check than to
// fetch. Fixed-name files (the term list, manifests) are kept for a minute,
// the edge's own TTL for the catalog's (DATA.md §2.5). This stands in for
// TanStack Query, which is the browser's; the Worker has no query cache.
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
import { type CampusMap, campusMap, EMPTY_CAMPUS } from "~/core/travel";
import { decodeRoutes } from "~/core/travel/routes-binary";

const HASHED = /\.[0-9a-f]{16}\.(json|bin)$/;
/** Parsed hashed files an isolate keeps: about a dozen departments' worth of an agent's run. */
const MAX_KEPT = 48;
/** How long a fixed-name file is kept: the catalog manifests' edge TTL. */
const FIXED_TTL_MS = 60_000;

type Kept = { value: Promise<unknown>; at: number };
const kept = new Map<string, Kept>();

/** Forget everything (tests). */
export function clearPublishedCache(): void {
  kept.clear();
}

function remember(
  key: string,
  load: () => Promise<unknown>,
  now: number,
): Promise<unknown> {
  const hashed = HASHED.test(key);
  const hit = kept.get(key);
  if (hit && (hashed || now - hit.at < FIXED_TTL_MS)) {
    // Most recently used goes last, so the oldest is evicted first.
    kept.delete(key);
    kept.set(key, hit);
    return hit.value;
  }
  const value = load();
  // A failed or missing read isn't kept: the next call tries again.
  value.then(
    (v) => {
      if (v === null) kept.delete(key);
    },
    () => kept.delete(key),
  );
  kept.set(key, { value, at: now });
  while (kept.size > MAX_KEPT) {
    const oldest = kept.keys().next().value;
    if (oldest === undefined) break;
    kept.delete(oldest);
  }
  return value;
}

export type McpData = ReturnType<typeof mcpData>;

/** The published data, read from `bucket` (`now` is the clock, for the fixed files' TTL). */
export function mcpData(bucket: R2Bucket, now: () => number = Date.now) {
  function read<S extends z.ZodType>(
    key: string,
    schema: S,
  ): Promise<z.output<S> | null> {
    return remember(
      key,
      async () => {
        const object = await bucket.get(key);
        if (!object) return null;
        const parsed = schema.safeParse(await object.json());
        return parsed.success ? parsed.data : null;
      },
      now(),
    ) as Promise<z.output<S> | null>;
  }

  /** A derived value of a hashed file, kept beside it (a search index, a decoded binary). */
  function derive<T>(key: string, load: () => Promise<T>): Promise<T> {
    return remember(`${key}#derived`, load, now()) as Promise<T>;
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

  async function seatsAsOf(termId: TermId): Promise<string | null> {
    const m = await manifest(termId);
    return m?.seats?.fetchedAt ?? null;
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
    seatsAsOf,
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
