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

/**
 * How soon a read is needed, as the browser's Fetch Priority hint: "low" for
 * background loads, so a file something on screen waits for goes first.
 */
export type ReadPriority = "high" | "low" | "auto";

export interface ReadOptions {
  priority?: ReadPriority;
  /**
   * Stops the read: a pointer's deadline aborts it with its own
   * `DataError` ("timeout"), which the read then throws.
   */
  signal?: AbortSignal;
}

export interface DataSource {
  readonly kind: "mock" | "live";
  /** Parsed JSON at a DATA.md key. Throws `DataError` when it's missing or unreadable. */
  readJson(key: string, options?: ReadOptions): Promise<unknown>;
  /** Raw bytes (the routes binary). */
  readBinary(key: string, options?: ReadOptions): Promise<ArrayBuffer>;
}

export class DataError extends Error {
  constructor(
    readonly key: string,
    /**
     * `timeout`: the server was reachable but too slow for a pointer's
     * deadline; not offline, and not tried again at once.
     */
    readonly reason: "missing" | "network" | "invalid" | "timeout",
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
  const request = async (
    key: string,
    options: ReadOptions = {},
  ): Promise<Response> => {
    let response: Response;
    try {
      const init: RequestInit = {};
      if (options.priority) init.priority = options.priority;
      if (options.signal) init.signal = options.signal;
      response = await fetchImpl(
        `${base}/${key}`,
        Object.keys(init).length > 0 ? init : undefined,
      );
    } catch (error) {
      // Stopped by a deadline: that's what failed, not the connection.
      if (options.signal?.reason instanceof DataError)
        throw options.signal.reason;
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
    readJson: async (key, options) => {
      const response = await request(key, options);
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new DataError(key, "invalid", `${key} isn't valid JSON`);
      }
    },
    readBinary: async (key, options) =>
      (await request(key, options)).arrayBuffer(),
  };
}

export interface DataSourceConfig {
  dataSource: "mock" | "live";
  dataBaseUrl: string;
}

/**
 * Set to "http" in localStorage, mock mode fetches the fixtures from the dev
 * Worker's `/data` (local R2, which `pnpm dev:mock` seeds with the same
 * files) instead of reading them from memory: real requests, for DevTools
 * throttling and for e2e specs that delay files with `page.route`.
 */
export const MOCK_DATA_OVER_HTTP_KEY = "terpsicle:mock-data";

function mockDataOverHttp(): boolean {
  try {
    return globalThis.localStorage?.getItem(MOCK_DATA_OVER_HTTP_KEY) === "http";
  } catch {
    return false;
  }
}

/**
 * Mock mode reads the fixtures' mock bucket, imported only here and only in
 * mock (and test) builds. Production builds drop the import, so no chunk of
 * theirs can reach the fixtures: this module is shared with pages that load
 * without the scheduler (Reviews), and a reachable fixtures chunk would
 * split the scheduler's own modules out of its chunk.
 */
export async function createDataSource(
  config: DataSourceConfig,
): Promise<DataSource> {
  if (config.dataSource === "live")
    return createFetchDataSource(config.dataBaseUrl);
  if (import.meta.env.MODE === "mock" || import.meta.env.MODE === "test") {
    if (mockDataOverHttp())
      return { ...createFetchDataSource(config.dataBaseUrl), kind: "mock" };
    const { mockDataSource } = await import("~/fixtures");
    return createBucketDataSource(mockDataSource);
  }
  throw new DataError(
    "",
    "missing",
    "Mock data is only in mock builds (pnpm dev:mock)",
  );
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
  options?: ReadOptions,
): Promise<z.infer<S>> {
  const raw = await source.readJson(key, options);
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
    deptChunk: (
      termId: TermId,
      dept: DeptCode,
      hash: ContentHash,
      options?: ReadOptions,
    ) =>
      readParsed(
        source,
        deptChunkKey(termId, dept, hash),
        DeptChunkSchema,
        "catalog",
        options,
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
