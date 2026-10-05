import type { QueryClient } from "@tanstack/react-query";
import { buildCatalogIndex, type CatalogIndex } from "~/core/catalog";
import { termTagCandidates } from "~/core/catalog/term-tag";
import {
  type FourYearCourses,
  fourYearCourses,
} from "~/core/four-year/course-lookup";
import type {
  AcademicCalendar,
  ChangesFile,
  Course,
  DeptCode,
  InstructorSlug,
  IsoDate,
  SeatsFile,
  TermId,
} from "~/core/schema";
import { instructorNameKey } from "~/core/schema";
import type { CampusMap } from "~/core/travel";
import { pageSource } from "~/lib/published-source";
import {
  buildingsQuery,
  calendarQuery,
  campusFrom,
  changesQuery,
  deptChunkQuery,
  geoManifestQuery,
  manifestQuery,
  planetTerpDeptQuery,
  planetTerpEntry,
  planetTerpManifestQuery,
  routesQuery,
  seatsQuery,
  termsQuery,
} from "~/state/query/catalog";
import { ensureIndexDepts } from "~/state/query/course-index";

// What Home reads from published data (docs/DATA.md §2), after the page
// shows what's on the device: the academic calendars for Now and Next, the
// campus map for walking times, the next term's catalog for the plan's
// problems, and the course index for Plan's credits and GenEds. Every file
// is read through its published query (~/state/query) in the page's one
// QueryClient (docs/decisions.md, "TanStack Query for server data"), so
// Home shares Schedule's and Plan's copies, shows what this device saved
// at once and offline, and checks a pointer in the background once it's
// stale. Nothing here is Home's own: every read fails quietly to "not
// yet". Loaded on first use (./queries.ts), so Home's first load carries
// neither the persister nor the stores (scripts/check-bundle.ts).

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
  client: QueryClient,
  today: IsoDate,
): Promise<AcademicCalendar[]> {
  const source = await orNull(pageSource());
  if (!source) return [];
  const terms = await orNull(
    client.ensureQueryData({ ...termsQuery(source), revalidateIfStale: true }),
  );
  const listed = new Set(terms?.terms.map((t) => t.id) ?? []);
  const wanted = termTagCandidates(today).filter((id) => listed.has(id));
  const calendars = await Promise.all(
    wanted.map((id) =>
      orNull(
        client.ensureQueryData({
          ...calendarQuery(source, id),
          revalidateIfStale: true,
        }),
      ),
    ),
  );
  return calendars.filter((c) => c !== null);
}

/** Walking distances, or null when the geo files can't be read. */
export async function loadCampus(
  client: QueryClient,
): Promise<CampusMap | null> {
  const source = await orNull(pageSource());
  if (!source) return null;
  const manifest = await orNull(
    client.ensureQueryData({
      ...geoManifestQuery(source),
      revalidateIfStale: true,
    }),
  );
  if (!manifest?.routes) return null;
  const [buildings, routes] = await Promise.all([
    orNull(client.ensureQueryData(buildingsQuery(source, manifest))),
    orNull(client.ensureQueryData(routesQuery(source, manifest))),
  ]);
  if (!routes) return null;
  return campusFrom(buildings ?? undefined, routes);
}

/**
 * PlanetTerp's slug for each instructor you could review (keyed by their
 * `instructorNameKey`, per department), from the departments' PlanetTerp
 * files: where Home's rows send you while reviews live on PlanetTerp.
 * Someone PlanetTerp doesn't know is left out.
 */
export async function loadPlanetTerpSlugs(
  client: QueryClient,
  people: readonly { dept: DeptCode; name: string }[],
): Promise<Record<string, InstructorSlug>> {
  const out: Record<string, InstructorSlug> = {};
  const source = await orNull(pageSource());
  if (!source) return out;
  const manifest = await orNull(
    client.ensureQueryData({
      ...planetTerpManifestQuery(source),
      revalidateIfStale: true,
    }),
  );
  if (!manifest) return out;
  const depts = [...new Set(people.map((p) => p.dept))];
  const files = await Promise.all(
    depts.map(async (dept) => {
      const entry = planetTerpEntry(manifest, dept);
      if (!entry) return [dept, null] as const;
      return [
        dept,
        await orNull(
          client.ensureQueryData(planetTerpDeptQuery(source, entry)),
        ),
      ] as const;
    }),
  );
  const byDept = new Map(files);
  for (const { dept, name } of people) {
    const key = instructorNameKey(name);
    const slug = byDept.get(dept)?.names[key];
    if (slug) out[`${dept}:${key}`] = slug;
  }
  return out;
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
 * Some departments of a term's catalog, with its seats and changes: what
 * a plan's problems need. Null when the term's manifest can't be read (it
 * isn't published, or we're offline with nothing saved).
 */
export async function loadPlanCatalog(
  client: QueryClient,
  termId: TermId,
  depts: readonly DeptCode[],
): Promise<PlanCatalog | null> {
  const source = await orNull(pageSource());
  if (!source) return null;
  const manifest = await orNull(
    client.ensureQueryData({
      ...manifestQuery(source, termId),
      revalidateIfStale: true,
    }),
  );
  if (!manifest) return null;
  const wanted = new Set(depts);
  const listed = manifest.departments.filter((d) => wanted.has(d.code));
  const [chunks, seats, changes] = await Promise.all([
    Promise.all(
      listed.map(async (d) => ({
        dept: d.code,
        chunk: await orNull(
          client.ensureQueryData(deptChunkQuery(source, termId, d)),
        ),
      })),
    ),
    manifest.seats
      ? orNull(
          client.ensureQueryData(
            seatsQuery(source, termId, manifest.seats.hash),
          ),
        )
      : null,
    manifest.changes
      ? orNull(
          client.ensureQueryData(
            changesQuery(source, termId, manifest.changes.hash),
          ),
        )
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
 * courses count nothing yet (as in Plan); one the index doesn't list at
 * all counts as loaded: its codes aren't in Testudo. Null when the
 * index's manifest can't be read.
 */
export async function loadFourYearCourses(
  client: QueryClient,
  depts: readonly DeptCode[],
): Promise<FourYearCourses | null> {
  const source = await orNull(pageSource());
  if (!source) return null;
  const read = await orNull(ensureIndexDepts(client, source, depts));
  if (!read) return null;
  const files = [...read.loaded.values()];
  const unlisted = [...read.loaded].filter(([, f]) => f === null);
  return fourYearCourses(
    files.flatMap((f) => f?.courses ?? []),
    unlisted.map(([dept]) => dept),
  );
}
