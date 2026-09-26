// The whole mock bucket: every R2 key the live jobs would write, with the
// exact bytes, content hashes and manifests (docs/DATA.md §2). `pnpm dev:mock`
// serves these under /data/*, so the data layer runs the same code path
// against mock and live data.
import {
  buildCourseIndexDept,
  buildCourseSearchFile,
  courseIndexTermOrder,
  courseSearchRow,
} from "~/core/catalog";
import {
  buildingsKey,
  type ChangesFile,
  COURSE_INDEX_MANIFEST_KEY,
  type CourseIndexManifest,
  type CourseSearchRow,
  calendarKey,
  changesKey,
  courseIndexDeptKey,
  courseSearchKey,
  deptChunkKey,
  GEO_MANIFEST_KEY,
  type GeoManifest,
  type Manifest,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpManifest,
  planetTerpDeptKey,
  routeGeometryKey,
  routesKey,
  seatsKey,
  summaryKey,
  TERMS_KEY,
  type TermId,
  TRAVEL_MODES,
} from "~/core/schema";
import { FIXTURE_NOW } from "../builders";
import { mockCatalog, mockDepartmentNames } from "./catalog";
import { mockChanges } from "./changes";
import {
  encodeMockRoutes,
  mockBuildingsFile,
  mockDistanceFeet,
  mockRouteGeometries,
  mockRoutesIndex,
} from "./geo";
import {
  MOCK_GRADES_THROUGH,
  MOCK_LATEST_REVIEW_AT,
  mockPlanetTerpDepts,
  mockReviewSummaries,
} from "./planetterp";
import { MOCK_SEATS_FETCHED_AT, mockArchivedSeats, mockSeats } from "./seats";
import { mockCalendars, mockTermsFile } from "./terms";

/** R2 key → the exact bytes stored there. */
export type MockDataFiles = ReadonlyMap<string, Uint8Array<ArrayBuffer>>;

const encoder = new TextEncoder();
// Copied into a fresh ArrayBuffer: Node's TextEncoder types allow a shared buffer.
const jsonBytes = (value: unknown): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encoder.encode(JSON.stringify(value)));

/** First 16 hex chars of SHA-256, as the publisher names hashed files. */
async function contentHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function build(): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const put = (key: string, bytes: Uint8Array<ArrayBuffer>) =>
    files.set(key, bytes);
  const putHashed = async (
    keyFor: (hash: string) => string,
    value: unknown,
    raw?: Uint8Array<ArrayBuffer>,
  ) => {
    const bytes = raw ?? jsonBytes(value);
    const hash = await contentHash(bytes);
    put(keyFor(hash), bytes);
    return hash;
  };

  put(TERMS_KEY, jsonBytes(mockTermsFile));

  const seatsByTerm: Record<TermId, typeof mockSeats> = {
    [mockSeats.termId]: mockSeats,
    [mockArchivedSeats.termId]: mockArchivedSeats,
  };
  for (const [termId, chunks] of Object.entries(mockCatalog)) {
    const departments: Manifest["departments"] = [];
    for (const chunk of chunks) {
      const hash = await putHashed(
        (h) => deptChunkKey(termId, chunk.dept, h),
        chunk,
      );
      departments.push({
        code: chunk.dept,
        name: mockDepartmentNames[termId]?.[chunk.dept] ?? chunk.dept,
        hash,
        courseCount: chunk.courses.length,
        sectionCount: chunk.courses.reduce((n, c) => n + c.sections.length, 0),
      });
    }
    const seats = seatsByTerm[termId];
    const changes: ChangesFile =
      termId === mockChanges.termId
        ? mockChanges
        : { schemaVersion: 1, termId, since: mockChanges.since, changes: [] };
    const manifest: Manifest = {
      schemaVersion: 1,
      termId,
      generatedAt: MOCK_SEATS_FETCHED_AT,
      catalogCrawledAt: "2026-09-25T06:00:00.000Z",
      departments,
      seats: seats
        ? {
            hash: await putHashed((h) => seatsKey(termId, h), seats),
            asOf: seats.asOf,
            fetchedAt: MOCK_SEATS_FETCHED_AT,
          }
        : null,
      changes: {
        hash: await putHashed((h) => changesKey(termId, h), changes),
        count: changes.changes.length,
        latestAt: changes.changes[0]?.at ?? null,
      },
    };
    put(manifestKey(termId), jsonBytes(manifest));
  }

  // The course index, built by the same code the catalog job runs.
  const order = courseIndexTermOrder(mockTermsFile.terms);
  const indexDepts = [
    ...new Set(Object.values(mockCatalog).flatMap((c) => c.map((d) => d.dept))),
  ].sort();
  const indexDepartments: CourseIndexManifest["departments"] = [];
  const searchRows: CourseSearchRow[] = [];
  for (const dept of indexDepts) {
    const file = buildCourseIndexDept(
      dept,
      order.flatMap((termId) =>
        (mockCatalog[termId] ?? [])
          .filter((chunk) => chunk.dept === dept)
          .map((chunk) => ({ termId, courses: chunk.courses })),
      ),
    );
    indexDepartments.push({
      code: dept,
      hash: await putHashed((h) => courseIndexDeptKey(dept, h), file),
    });
    searchRows.push(...file.courses.map(courseSearchRow));
  }
  const courseIndexManifest: CourseIndexManifest = {
    schemaVersion: 1,
    generatedAt: "2026-09-25T06:00:00.000Z",
    search: {
      hash: await putHashed(courseSearchKey, buildCourseSearchFile(searchRows)),
    },
    departments: indexDepartments,
  };
  put(COURSE_INDEX_MANIFEST_KEY, jsonBytes(courseIndexManifest));

  const ptDepartments: PlanetTerpManifest["departments"] = [];
  for (const dept of mockPlanetTerpDepts)
    ptDepartments.push({
      code: dept.dept,
      hash: await putHashed((h) => planetTerpDeptKey(dept.dept, h), dept),
    });
  const ptManifest: PlanetTerpManifest = {
    schemaVersion: 1,
    generatedAt: FIXTURE_NOW,
    gradesThrough: MOCK_GRADES_THROUGH,
    departments: ptDepartments,
    // Like production: good runs, but no new review since May.
    source: {
      status: "stale",
      lastSuccessAt: FIXTURE_NOW,
      gradesThrough: MOCK_GRADES_THROUGH,
      latestReviewAt: MOCK_LATEST_REVIEW_AT,
    },
  };
  put(PLANETTERP_MANIFEST_KEY, jsonBytes(ptManifest));
  for (const summary of mockReviewSummaries)
    put(summaryKey(summary.slug), jsonBytes(summary));

  const known = { standard: 0, accessible: 0 };
  for (const mode of TRAVEL_MODES)
    for (const a of mockRoutesIndex.buildings)
      for (const b of mockRoutesIndex.buildings)
        if (a !== b && typeof mockDistanceFeet(a, b, mode) === "number")
          known[mode]++;
  const geoManifest: GeoManifest = {
    schemaVersion: 1,
    generatedAt: FIXTURE_NOW,
    buildings: {
      hash: await putHashed(buildingsKey, mockBuildingsFile),
      count: mockBuildingsFile.buildings.length,
    },
    routes: {
      hash: await putHashed(routesKey, null, encodeMockRoutes()),
      buildingCount: mockRoutesIndex.buildings.length,
      knownPairs: known,
      builtAt: "2026-09-25T07:50:00.000Z",
    },
  };
  put(GEO_MANIFEST_KEY, jsonBytes(geoManifest));
  for (const g of mockRouteGeometries)
    put(routeGeometryKey(g.from, g.to, g.mode), jsonBytes(g));

  for (const calendar of mockCalendars)
    put(calendarKey(calendar.termId), jsonBytes(calendar));
  return files;
}

let built: Promise<Map<string, Uint8Array<ArrayBuffer>>> | null = null;

/** Every mock R2 object. Built once (hashing is async), then shared. */
export function buildMockDataFiles(): Promise<MockDataFiles> {
  built ??= build();
  return built;
}

/**
 * The mock bucket, read by R2 key (no `/data/` prefix). `get` returns null
 * where R2 would 404. Summaries sit under `summaries/` for the mock server fn;
 * `/data` doesn't serve them (see `dataCachePolicy`). There are no map tiles.
 */
export const mockDataSource = {
  async keys(): Promise<string[]> {
    return [...(await buildMockDataFiles()).keys()].sort();
  },
  async get(key: string): Promise<Uint8Array<ArrayBuffer> | null> {
    return (await buildMockDataFiles()).get(key) ?? null;
  },
  /** Parsed JSON for a key; validate it with the matching schema like live data. */
  async json(key: string): Promise<unknown> {
    const bytes = await mockDataSource.get(key);
    return bytes === null ? null : JSON.parse(new TextDecoder().decode(bytes));
  },
};
