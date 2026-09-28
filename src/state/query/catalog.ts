import {
  type QueryClient,
  queryOptions,
  skipToken,
} from "@tanstack/react-query";
import {
  AcademicCalendarSchema,
  type BuildingCode,
  BuildingsFileSchema,
  buildingsKey,
  type ContentHash,
  calendarKey,
  type DeptCode,
  GEO_MANIFEST_KEY,
  type GeoManifest,
  GeoManifestSchema,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  PlanetTerpDeptSchema,
  type PlanetTerpManifest,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
  RouteGeometrySchema,
  routeGeometryKey,
  routesKey,
  type TermId,
  type TravelMode,
} from "~/core/schema";
import {
  type CampusMap,
  campusMap,
  decodeRoutes,
  EMPTY_CAMPUS,
} from "~/core/travel";
import { DataError, type DataSource, readParsed } from "../data-source";
import {
  BINARY,
  publishedBinary,
  publishedFile,
  publishedFixed,
  publishedKey,
  publishedPointer,
  retryPublished,
} from "./published";

// The catalog's reference data as published-file queries (DATA.md §4,
// §5.1 step 6): PlanetTerp per department, the campus map (the geo
// manifest, the buildings file and the routes binary) and each term's
// academic calendar, plus a connection's walking path. The terms,
// manifests, departments and seats are still the catalog store's
// (../catalog-store.ts) until they move over too.

const DAY_MS = 24 * 60 * 60 * 1000;

/** PlanetTerp and the campus files change at most daily. */
export const REFERENCE_STALE_MS = DAY_MS;

// ---------- PlanetTerp ----------

/** `planetterp/manifest.json`: each department's file, and how current PlanetTerp is. */
export function planetTerpManifestQuery(source: DataSource | null) {
  return publishedPointer(
    source,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
    "planetterp",
    {
      staleTime: REFERENCE_STALE_MS,
      lists: (m) => m.departments.map((d) => planetTerpDeptKey(d.code, d.hash)),
      fileSchema: () => PlanetTerpDeptSchema,
    },
  );
}

/** Where a department is in PlanetTerp's manifest; undefined when it has none. */
export function planetTerpEntry(
  manifest: PlanetTerpManifest | undefined,
  dept: DeptCode,
): { code: DeptCode; hash: ContentHash } | undefined {
  return manifest?.departments.find((d) => d.code === dept);
}

/** A department's PlanetTerp file, at the manifest's hash (none: nothing to read). */
export function planetTerpDeptQuery(
  source: DataSource | null,
  entry: { code: DeptCode; hash: ContentHash } | undefined,
) {
  return publishedFile(
    entry ? source : null,
    entry ? planetTerpDeptKey(entry.code, entry.hash) : "planetterp/dept/none",
    PlanetTerpDeptSchema,
    "planetterp",
  );
}

/**
 * These departments' PlanetTerp files, outside React (the generator's
 * ranking), each on its own: one that can't load is left out, which
 * ranking treats as unrated. Empty when the manifest can't load.
 */
export async function ensurePlanetTerpDepts(
  client: QueryClient,
  source: DataSource,
  depts: readonly DeptCode[],
): Promise<Map<DeptCode, PlanetTerpDept>> {
  const out = new Map<DeptCode, PlanetTerpDept>();
  const manifest = await client
    .ensureQueryData(planetTerpManifestQuery(source))
    .catch(() => null);
  if (!manifest) return out;
  const unique = [...new Set(depts)];
  const files = await Promise.allSettled(
    unique.map((dept) => {
      const entry = planetTerpEntry(manifest, dept);
      return entry
        ? client.ensureQueryData(planetTerpDeptQuery(source, entry))
        : Promise.resolve(null);
    }),
  );
  files.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value)
      out.set(unique[i] as DeptCode, result.value);
  });
  return out;
}

// ---------- the campus map ----------

/** `geo/manifest.json`: the buildings file's hash, and the routes binary's once there is one. */
export function geoManifestQuery(source: DataSource | null) {
  return publishedPointer(source, GEO_MANIFEST_KEY, GeoManifestSchema, "geo", {
    staleTime: REFERENCE_STALE_MS,
    lists: (m) => [
      buildingsKey(m.buildings.hash),
      ...(m.routes ? [routesKey(m.routes.hash)] : []),
    ],
    fileSchema: (key) =>
      key.startsWith("geo/routes.") ? BINARY : BuildingsFileSchema,
  });
}

/** The buildings file (off-campus codes), at the manifest's hash. */
export function buildingsQuery(
  source: DataSource | null,
  manifest: GeoManifest | undefined,
) {
  return publishedFile(
    manifest ? source : null,
    manifest ? buildingsKey(manifest.buildings.hash) : "geo/buildings.none",
    BuildingsFileSchema,
    "geo",
  );
}

/** The routes binary, at the manifest's hash (none until the first routes run). */
export function routesQuery(
  source: DataSource | null,
  manifest: GeoManifest | undefined,
) {
  const hash = manifest?.routes?.hash;
  return publishedBinary(
    hash ? source : null,
    hash ? routesKey(hash) : "geo/routes.none",
    "geo",
  );
}

/** The campus map from its files; `EMPTY_CAMPUS` with neither. */
export function campusFrom(
  buildings: Parameters<typeof campusMap>[1] | undefined,
  routes: ArrayBuffer | undefined,
): CampusMap {
  if (!buildings && !routes) return EMPTY_CAMPUS;
  return campusMap(routes ? decodeRoutes(routes) : null, buildings ?? null);
}

/** The campus map as far as it's loaded, without loading more; outside React. */
export function loadedCampus(
  client: QueryClient,
  source: DataSource,
): CampusMap {
  const manifest = client.getQueryData(geoManifestQuery(source).queryKey);
  if (!manifest) return EMPTY_CAMPUS;
  return campusFrom(
    client.getQueryData(buildingsQuery(source, manifest).queryKey),
    client.getQueryData(routesQuery(source, manifest).queryKey),
  );
}

/** The campus map, outside React (the generator's travel check). */
export async function ensureCampus(
  client: QueryClient,
  source: DataSource,
): Promise<CampusMap> {
  const manifest = await client.ensureQueryData(geoManifestQuery(source));
  const [buildings, routes] = await Promise.all([
    client.ensureQueryData(buildingsQuery(source, manifest)),
    manifest.routes
      ? client.ensureQueryData(routesQuery(source, manifest))
      : undefined,
  ]);
  return campusFrom(buildings, routes);
}

// ---------- academic calendars ----------

/**
 * A term's academic calendar. Fixed-name and rarely changed: shown from
 * disk at once and checked once per page. A file that isn't there means
 * the provost hasn't published the dates yet (`isNotPublished`).
 */
export function calendarQuery(
  source: DataSource | null,
  termId: TermId | null,
) {
  return publishedFixed(
    termId ? source : null,
    termId ? calendarKey(termId) : "calendar/none",
    AcademicCalendarSchema,
    "calendar",
    REFERENCE_STALE_MS,
  );
}

/** A read that failed because the file isn't published (yet): not an error to show. */
export function isNotPublished(error: unknown): boolean {
  return error instanceof DataError && error.reason === "missing";
}

// ---------- a connection's walking path ----------

/**
 * A connection's walking path for a map. Fixed-name, with a day's max-age
 * that the browser's HTTP cache keeps, so it isn't saved here too. Null
 * when there's no file: hide the map, never draw a straight line
 * (DATA.md §4.3).
 */
export function routeGeometryQuery(
  source: DataSource | null,
  from: BuildingCode | null,
  to: BuildingCode | null,
  mode: TravelMode,
) {
  const key = from && to ? routeGeometryKey(from, to, mode) : "geo/route/none";
  return queryOptions({
    queryKey: publishedKey(source?.kind ?? "none", key),
    queryFn:
      source && from && to
        ? () =>
            readParsed(source, key, RouteGeometrySchema, "geo").catch(
              (error: unknown) => {
                if (isNotPublished(error)) return null;
                throw error;
              },
            )
        : skipToken,
    staleTime: DAY_MS,
    retry: retryPublished,
    networkMode: "always",
  });
}
