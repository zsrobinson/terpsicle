import type { TravelMode } from "./geo";
import type {
  BuildingCode,
  ContentHash,
  DeptCode,
  InstructorSlug,
  TermId,
} from "./primitives";

// R2 object keys, in one place so producers and readers can't drift (docs/DATA.md §2).
// The browser fetches `${DATA_URL_PREFIX}${key}`.

export const DATA_URL_PREFIX = "/data/";

export const TERMS_KEY = "catalog/terms.json";
export const manifestKey = (termId: TermId): string =>
  `catalog/${termId}/manifest.json`;
export const deptChunkKey = (
  termId: TermId,
  dept: DeptCode,
  hash: ContentHash,
): string => `catalog/${termId}/dept/${dept}.${hash}.json`;
export const seatsKey = (termId: TermId, hash: ContentHash): string =>
  `catalog/${termId}/seats.${hash}.json`;
export const changesKey = (termId: TermId, hash: ContentHash): string =>
  `catalog/${termId}/changes.${hash}.json`;

export const PLANETTERP_MANIFEST_KEY = "planetterp/manifest.json";
export const planetTerpDeptKey = (dept: DeptCode, hash: ContentHash): string =>
  `planetterp/dept/${dept}.${hash}.json`;

export const GEO_MANIFEST_KEY = "geo/manifest.json";
export const buildingsKey = (hash: ContentHash): string =>
  `geo/buildings.${hash}.json`;
export const routesKey = (hash: ContentHash): string =>
  `geo/routes.${hash}.bin`;
export const routeGeometryKey = (
  from: BuildingCode,
  to: BuildingCode,
  mode: TravelMode,
): string => `geo/route/${from}-${to}-${mode}.json`;
export const TILES_KEY = "geo/tiles.pmtiles";

export const calendarKey = (termId: TermId): string =>
  `calendar/${termId}.json`;

/** Read and written only by the reviewSummary server fn; not served under /data. */
export const summaryKey = (slug: InstructorSlug): string =>
  `summaries/${slug}.json`;

/** Job state (resume cursors, last crawl snapshots). Never served. */
export const JOBS_PREFIX = "_jobs/";

export const planetTerpUrl = (slug: InstructorSlug): string =>
  `https://planetterp.com/professor/${encodeURIComponent(slug)}`;

/**
 * The key a Testudo instructor name is joined on (PlanetTerpDept.names).
 * Ingest and client must use this same function.
 */
export function instructorNameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export type DataCachePolicy = {
  /** Sent to the browser. */
  cacheControl: string;
  /** How long the Worker keeps it in the Cache API. */
  edgeTtlSeconds: number;
};

const HASHED = /\.[0-9a-f]{16}\.(json|bin)$/;
const YEAR = 365 * 24 * 3600;

/**
 * Caching for a key served under /data; null means don't serve it (404).
 * Everything served also gets an ETag.
 */
export function dataCachePolicy(key: string): DataCachePolicy | null {
  if (
    key.startsWith(JOBS_PREFIX) ||
    key.startsWith("summaries/") ||
    key.includes("..")
  )
    return null;
  if (HASHED.test(key))
    return {
      cacheControl: `public, max-age=${YEAR}, immutable`,
      edgeTtlSeconds: YEAR,
    };
  if (key === TERMS_KEY || key.endsWith("/manifest.json")) {
    return {
      cacheControl: "public, no-cache",
      edgeTtlSeconds: key.startsWith("catalog/") ? 60 : 3600,
    };
  }
  if (key.startsWith("calendar/"))
    return { cacheControl: "public, max-age=3600", edgeTtlSeconds: 3600 };
  if (key.startsWith("geo/route/"))
    return { cacheControl: "public, max-age=86400", edgeTtlSeconds: 86400 };
  if (key === TILES_KEY)
    return { cacheControl: "public, max-age=604800", edgeTtlSeconds: 604800 };
  return null;
}
