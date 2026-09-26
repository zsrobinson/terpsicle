import type { z } from "zod";
import {
  AcademicCalendarSchema,
  type BuildingCode,
  BuildingsFileSchema,
  buildingsKey,
  ChangesFileSchema,
  type ContentHash,
  calendarKey,
  changesKey,
  DeptChunkSchema,
  type DeptCode,
  deptChunkKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  ManifestSchema,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
  RouteGeometrySchema,
  routeGeometryKey,
  routesKey,
  SCHEMA_VERSIONS,
  type SchemaFamily,
  SeatsFileSchema,
  seatsKey,
  TERMS_KEY,
  type TermId,
  TermsFileSchema,
  type TravelMode,
  WireEnvelopeSchema,
} from "~/core/schema";

// The one way the app reads published data, by DATA.md key (§2.1). Mock mode
// serves files from memory; live mode fetches `/data/<key>`. The IndexedDB
// cache and manifest diffing sit above this, in the catalog store.

export interface DataSource {
  readonly kind: "mock" | "live";
  /** Parsed JSON at a DATA.md key. Throws `DataError` when it's missing or unreadable. */
  readJson(key: string): Promise<unknown>;
  /** Raw bytes (the routes binary). */
  readBinary(key: string): Promise<ArrayBuffer>;
}

export class DataError extends Error {
  constructor(
    readonly key: string,
    readonly reason: "missing" | "network" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }
}

/** Serves files from a key → value map. `ArrayBuffer` values are binaries. */
export function createMemoryDataSource(
  files: Readonly<Record<string, unknown>>,
  kind: DataSource["kind"] = "mock",
): DataSource {
  const get = (key: string): unknown => {
    if (!(key in files))
      throw new DataError(key, "missing", `No data at ${key}`);
    return files[key];
  };
  return {
    kind,
    readJson: async (key) => structuredClone(get(key)),
    readBinary: async (key) => {
      const value = get(key);
      if (!(value instanceof ArrayBuffer))
        throw new DataError(key, "invalid", `${key} isn't binary`);
      return value.slice(0);
    },
  };
}

/** A bucket that returns each key's bytes, or null where R2 would 404. */
export interface Bucket {
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;
}

/** Reads a bucket of bytes, as the fixtures' mock bucket is. */
export function createBucketDataSource(
  bucket: Bucket,
  kind: DataSource["kind"] = "mock",
): DataSource {
  const get = async (key: string): Promise<Uint8Array<ArrayBuffer>> => {
    const bytes = await bucket.get(key);
    if (!bytes) throw new DataError(key, "missing", `No data at ${key}`);
    return bytes;
  };
  return {
    kind,
    readJson: async (key) => {
      const bytes = await get(key);
      try {
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      } catch {
        throw new DataError(key, "invalid", `${key} isn't valid JSON`);
      }
    },
    readBinary: async (key) => (await get(key)).slice().buffer,
  };
}

/** Fetches `<baseUrl>/<key>`. */
export function createFetchDataSource(
  baseUrl: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): DataSource {
  const base = baseUrl.replace(/\/+$/, "");
  const request = async (key: string): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(`${base}/${key}`);
    } catch (error) {
      throw new DataError(
        key,
        "network",
        `Couldn't reach the server for ${key}: ${String(error)}`,
      );
    }
    if (response.status === 404)
      throw new DataError(key, "missing", `No data at ${key}`);
    if (!response.ok)
      throw new DataError(
        key,
        "network",
        `The server answered ${response.status} for ${key}`,
      );
    return response;
  };
  return {
    kind: "live",
    readJson: async (key) => {
      const response = await request(key);
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new DataError(key, "invalid", `${key} isn't valid JSON`);
      }
    },
    readBinary: async (key) => (await request(key)).arrayBuffer(),
  };
}

export interface DataSourceConfig {
  dataSource: "mock" | "live";
  dataBaseUrl: string;
}

/**
 * Mock mode reads the fixtures' mock bucket, imported only here and only in
 * mock mode so production bundles never include it.
 */
export async function createDataSource(
  config: DataSourceConfig,
): Promise<DataSource> {
  if (config.dataSource === "live")
    return createFetchDataSource(config.dataBaseUrl);
  const { mockDataSource } = await import("~/fixtures");
  return createBucketDataSource(mockDataSource);
}

/**
 * A file in a schema version this build doesn't read (DATA.md §2.3). Newer
 * means this tab is out of date; older means the jobs haven't republished.
 */
export class SchemaVersionError extends DataError {
  constructor(
    key: string,
    readonly found: number,
    readonly expected: number,
  ) {
    super(
      key,
      "invalid",
      `${key} is schema version ${found}; this build reads ${expected}`,
    );
    this.name = "SchemaVersionError";
  }

  get newer(): boolean {
    return this.found > this.expected;
  }
}

/**
 * A published file, validated: the envelope first, so a newer format reads
 * as `SchemaVersionError` (reload), not as broken data.
 */
export async function readParsed<S extends z.ZodType>(
  source: DataSource,
  key: string,
  schema: S,
  family: SchemaFamily,
): Promise<z.infer<S>> {
  const raw = await source.readJson(key);
  const envelope = WireEnvelopeSchema.safeParse(raw);
  const expected = SCHEMA_VERSIONS[family];
  if (envelope.success && envelope.data.schemaVersion !== expected)
    throw new SchemaVersionError(key, envelope.data.schemaVersion, expected);
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new DataError(
      key,
      "invalid",
      `${key} doesn't match its schema: ${parsed.error.message}`,
    );
  return parsed.data;
}

/** Typed, validated reads for every published file (DATA.md §2.1). */
export function createDataReader(source: DataSource) {
  return {
    kind: source.kind,
    terms: () => readParsed(source, TERMS_KEY, TermsFileSchema, "catalog"),
    manifest: (termId: TermId) =>
      readParsed(source, manifestKey(termId), ManifestSchema, "catalog"),
    deptChunk: (termId: TermId, dept: DeptCode, hash: ContentHash) =>
      readParsed(
        source,
        deptChunkKey(termId, dept, hash),
        DeptChunkSchema,
        "catalog",
      ),
    seats: (termId: TermId, hash: ContentHash) =>
      readParsed(source, seatsKey(termId, hash), SeatsFileSchema, "catalog"),
    changes: (termId: TermId, hash: ContentHash) =>
      readParsed(
        source,
        changesKey(termId, hash),
        ChangesFileSchema,
        "catalog",
      ),
    planetTerpManifest: () =>
      readParsed(
        source,
        PLANETTERP_MANIFEST_KEY,
        PlanetTerpManifestSchema,
        "planetterp",
      ),
    planetTerpDept: (dept: DeptCode, hash: ContentHash) =>
      readParsed(
        source,
        planetTerpDeptKey(dept, hash),
        PlanetTerpDeptSchema,
        "planetterp",
      ),
    geoManifest: () =>
      readParsed(source, GEO_MANIFEST_KEY, GeoManifestSchema, "geo"),
    buildings: (hash: ContentHash) =>
      readParsed(source, buildingsKey(hash), BuildingsFileSchema, "geo"),
    routes: (hash: ContentHash) => source.readBinary(routesKey(hash)),
    routeGeometry: (from: BuildingCode, to: BuildingCode, mode: TravelMode) =>
      readParsed(
        source,
        routeGeometryKey(from, to, mode),
        RouteGeometrySchema,
        "geo",
      ),
    calendar: (termId: TermId) =>
      readParsed(
        source,
        calendarKey(termId),
        AcademicCalendarSchema,
        "calendar",
      ),
  };
}
export type DataReader = ReturnType<typeof createDataReader>;
