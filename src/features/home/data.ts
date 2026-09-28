import { clientConfig } from "~/app/config";
import { buildCatalogIndex, type CatalogIndex } from "~/core/catalog";
import { termTagCandidates } from "~/core/catalog/term-tag";
import {
  type FourYearCourses,
  fourYearCourses,
} from "~/core/four-year/course-lookup";
import {
  type AcademicCalendar,
  type ChangesFile,
  COURSE_INDEX_MANIFEST_KEY,
  type Course,
  CourseIndexDeptSchema,
  type CourseIndexEntry,
  CourseIndexManifestSchema,
  courseIndexDeptKey,
  type DeptCode,
  type IsoDate,
  type Plan,
  type SeatsFile,
  type TermId,
} from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { type CampusMap, campusMap, decodeRoutes } from "~/core/travel";
import {
  createDataReader,
  createDataSource,
  type DataSource,
  readParsed,
} from "~/state/data-source";

// What Home reads from published data (docs/DATA.md §2), after the page
// shows what's on the device: the academic calendars for Now and Next, the
// campus map for walking times, the next term's catalog for the plan's
// problems, and the course index for Plan's credits and GenEds. Only the
// files these need, through the same reader as Reviews: hashed files are
// cached by the browser for a year, so a second visit costs a manifest or
// two. Nothing here is Home's own: every read fails quietly to "not yet".

let opened: Promise<DataSource> | null = null;

function source(): Promise<DataSource> {
  opened ??= createDataSource(clientConfig);
  return opened;
}

async function reader() {
  return createDataReader(await source());
}

/** A read that may fail: null, and the card shows what it has. */
async function orNull<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch {
    return null;
  }
}

/**
 * The calendars of the terms that can be Now or Next on `today`, among
 * the terms Testudo lists. Missing ones are left out (their seasons stand
 * in, as everywhere).
 */
export async function loadCalendars(
  today: IsoDate,
): Promise<AcademicCalendar[]> {
  const read = await reader();
  const terms = await orNull(read.terms());
  const listed = new Set(terms?.terms.map((t) => t.id) ?? []);
  const wanted = termTagCandidates(today).filter((id) => listed.has(id));
  const calendars = await Promise.all(
    wanted.map((id) => orNull(read.calendar(id))),
  );
  return calendars.filter((c) => c !== null);
}

/** Walking distances, or null when the geo files can't be read. */
export async function loadCampus(): Promise<CampusMap | null> {
  const read = await reader();
  const manifest = await orNull(read.geoManifest());
  if (!manifest) return null;
  const [buildings, routes] = await Promise.all([
    orNull(read.buildings(manifest.buildings.hash)),
    manifest.routes ? orNull(read.routes(manifest.routes.hash)) : null,
  ]);
  if (!routes) return null;
  return campusMap(decodeRoutes(routes), buildings);
}

/** A term's catalog, as far as one plan needs it. */
export interface PlanCatalog {
  index: CatalogIndex;
  seats: SeatsFile | null;
  changes: ChangesFile | null;
  /** Departments the manifest lists whose file didn't load. */
  pendingDepts: ReadonlySet<DeptCode>;
}

/**
 * The plan's departments of a term's catalog, with its seats and changes:
 * what Problems needs. Null when the term's manifest can't be read (it
 * isn't published, or we're offline).
 */
export async function loadPlanCatalog(
  termId: TermId,
  plan: Pick<Plan, "courses">,
): Promise<PlanCatalog | null> {
  const read = await reader();
  const manifest = await orNull(read.manifest(termId));
  if (!manifest) return null;
  const depts = new Set(plan.courses.map((c) => c.courseCode.slice(0, 4)));
  const listed = manifest.departments.filter((d) => depts.has(d.code));
  const [chunks, seats, changes] = await Promise.all([
    Promise.all(
      listed.map(async (d) => ({
        dept: d.code,
        chunk: await orNull(read.deptChunk(termId, d.code, d.hash)),
      })),
    ),
    manifest.seats ? orNull(read.seats(termId, manifest.seats.hash)) : null,
    manifest.changes
      ? orNull(read.changes(termId, manifest.changes.hash))
      : null,
  ]);
  const courses: Course[] = [];
  const pendingDepts = new Set<DeptCode>();
  for (const { dept, chunk } of chunks) {
    if (chunk) courses.push(...chunk.courses);
    else pendingDepts.add(dept);
  }
  return {
    index: buildCatalogIndex(termId, courses),
    seats,
    changes,
    pendingDepts,
  };
}

/**
 * The course index's departments a four-year plan uses: its credits and
 * GenEds. Departments that can't be read count as not loaded, so their
 * courses count nothing yet (as in Plan).
 */
export async function loadFourYearCourses(
  doc: Pick<FourYearDoc, "entries">,
): Promise<FourYearCourses | null> {
  const src = await source();
  const manifest = await orNull(
    readParsed(
      src,
      COURSE_INDEX_MANIFEST_KEY,
      CourseIndexManifestSchema,
      "courses",
    ),
  );
  if (!manifest) return null;
  const depts = new Set<DeptCode>();
  for (const entry of doc.entries) {
    const codes =
      entry.kind === "course"
        ? [entry.code, entry.details?.countsAs]
        : entry.kind === "credit"
          ? [entry.countsAs]
          : [];
    for (const code of codes) if (code) depts.add(code.slice(0, 4));
  }
  const entries: CourseIndexEntry[] = [];
  const loaded: DeptCode[] = [];
  await Promise.all(
    manifest.departments.map(async (d) => {
      if (!depts.has(d.code)) return;
      const file = await orNull(
        readParsed(
          src,
          courseIndexDeptKey(d.code, d.hash),
          CourseIndexDeptSchema,
          "courses",
        ),
      );
      if (file) entries.push(...file.courses);
    }),
  );
  // Departments the index doesn't list at all: their codes aren't in Testudo.
  const listed = new Set(manifest.departments.map((d) => d.code));
  for (const dept of depts) if (!listed.has(dept)) loaded.push(dept);
  return fourYearCourses(entries, loaded);
}
