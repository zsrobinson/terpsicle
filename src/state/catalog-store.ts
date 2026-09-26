import { create } from "zustand";
import {
  buildCatalogIndex,
  type CatalogIndex,
  cachedCatalogOf,
  diffManifest,
} from "~/core/catalog";
import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  type BuildingCode,
  BuildingsFileSchema,
  buildingsKey,
  type ChangesFile,
  type Course,
  type CourseCode,
  calendarKey,
  changesKey,
  type DeptChunk,
  type DeptCode,
  deptChunkKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  type Manifest,
  ManifestSchema,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  type PlanetTerpManifest,
  PlanetTerpManifestSchema,
  type PlanetTerpSource,
  planetTerpDeptKey,
  type RouteGeometry,
  routesKey,
  SCHEMA_VERSIONS,
  type SchemaFamily,
  type SeatsFile,
  seatsKey,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
  type TravelMode,
} from "~/core/schema";
import {
  type CampusMap,
  campusMap,
  decodeRoutes,
  EMPTY_CAMPUS,
} from "~/core/travel";
import { type CacheFile, type DataCache, versionedCache } from "./data-cache";
import { DataError, type DataReader, SchemaVersionError } from "./data-source";

// Published data (DATA.md §2, §5.1): the term list; per term its manifest,
// seats, changes and departments (as a core CatalogIndex); the campus map;
// PlanetTerp per department; academic calendars.
//
// Every read goes through the same path, in mock and live mode alike:
// the IndexedDB cache first (instant startup, works offline), then the
// network to revalidate. Manifests are diffed against what's loaded (core
// `diffManifest`), so a poll fetches only the files whose hash changed.
// Files are validated before use; a file that fails keeps the previous one.

export type LoadState = "loading" | "ready" | "error";

export interface TermCatalog {
  manifest: Manifest | null;
  manifestState: LoadState;
  /** Where the manifest on screen came from: the browser's cache, or the server. */
  manifestSource: "cache" | "network" | null;
  /** When the server last confirmed the manifest; null if only cached so far. */
  checkedAt: string | null;
  depts: Readonly<Partial<Record<DeptCode, LoadState>>>;
  /** Every loaded course. Rebuilt (a new object) whenever departments load. */
  index: CatalogIndex;
  /** Every department in the manifest has loaded. */
  complete: boolean;
  seats: SeatsFile | null;
  /** The changes file (DATA.md §3.3): what `usePlanProblems` feeds core. */
  changes: ChangesFile | null;
}

/** Analytics the app records (docs/ANALYTICS.md); the store only reports them. */
export type CatalogEvent =
  | {
      type: "catalog_loaded";
      termId: TermId;
      fromCache: boolean;
      deptsFetched: number;
      ms: number;
    }
  | {
      type: "catalog_load_failed";
      termId: TermId | null;
      reason: CatalogFailureReason;
    };

/** Why a load failed: DataError's reasons, or a newer data format than this build reads. */
export type CatalogFailureReason = DataError["reason"] | "newer-data";

export interface CatalogOptions {
  cache?: DataCache | null;
  onEvent?: (event: CatalogEvent) => void;
}

export interface CatalogState {
  reader: DataReader | null;
  cache: DataCache | null;
  terms: readonly Term[] | null;
  termsState: LoadState | "idle";
  /** Specific, plain words for the person, when terms can't load. */
  termsError: string | null;
  byTerm: Readonly<Partial<Record<TermId, TermCatalog>>>;
  /** Routes and off-campus codes; `EMPTY_CAMPUS` until the geo files load. */
  campus: CampusMap;
  campusState: LoadState | "idle";
  /** PlanetTerp files by department (ratings, grades, the name join). */
  instructors: Readonly<Partial<Record<DeptCode, PlanetTerpDept>>>;
  instructorsState: Readonly<Partial<Record<DeptCode, LoadState>>>;
  /**
   * How current PlanetTerp is, from its manifest (DATA.md §4.1); null until
   * the manifest loads, or when it predates the `source` block.
   */
  planetTerpSource: PlanetTerpSource | null;
  /** Academic calendars by term (.ics export). */
  calendars: Readonly<Partial<Record<TermId, AcademicCalendar>>>;
  calendarsState: Readonly<Partial<Record<TermId, LoadState>>>;
  /** The last request to the server failed: show saved data, and say so quietly. */
  network: "online" | "offline";
  /**
   * The server publishes a newer data format than this tab understands
   * (DATA.md §2.3): keep what's loaded, and reload at the next visibility change.
   */
  appStale: boolean;

  setReader: (reader: DataReader, options?: CatalogOptions) => void;
  loadTerms: () => Promise<void>;
  /** Loads the term's manifest, seats and changes, then the given departments. */
  ensureDepts: (termId: TermId, depts: readonly DeptCode[]) => Promise<void>;
  /**
   * Loads every department of the term (search, fit and problems need them
   * all), `first` ones first: the plan's departments before the rest.
   */
  ensureTerm: (termId: TermId, first?: readonly DeptCode[]) => Promise<void>;
  /** Revalidates the term's manifest and fetches only what changed (the seat poll). */
  refreshTerm: (termId: TermId) => Promise<void>;
  /** Tries again after a failed first load. */
  retry: () => Promise<void>;
  /** Loads the buildings and routes files (DATA §4.2), once. */
  ensureCampus: () => Promise<void>;
  ensureInstructors: (dept: DeptCode) => Promise<void>;
  ensureCalendar: (termId: TermId) => Promise<void>;
  /** A connection's path (DATA.md §4.3); null when there's none to draw. */
  loadRouteGeometry: (
    from: BuildingCode,
    to: BuildingCode,
    mode: TravelMode,
  ) => Promise<RouteGeometry | null>;
}

/** DATA.md §5.1: fetch departments six at a time. */
const CONCURRENCY = 6;

function emptyTerm(termId: TermId): TermCatalog {
  return {
    manifest: null,
    manifestState: "loading",
    manifestSource: null,
    checkedAt: null,
    depts: {},
    index: buildCatalogIndex(termId, []),
    complete: false,
    seats: null,
    changes: null,
  };
}

const inFlight = new Map<string, Promise<void>>();
function once(key: string, run: () => Promise<void>): Promise<void> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await run(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

export const INITIAL_CATALOG_STATE = {
  reader: null,
  cache: null,
  terms: null,
  termsState: "idle",
  termsError: null,
  byTerm: {},
  campus: EMPTY_CAMPUS,
  campusState: "idle",
  instructors: {},
  instructorsState: {},
  planetTerpSource: null,
  calendars: {},
  calendarsState: {},
  network: "online",
  appStale: false,
} satisfies Partial<CatalogState>;

/** Loaded department chunks, per term, to rebuild the index from. */
const chunks = new Map<TermId, Map<DeptCode, readonly Course[]>>();
/** Per term, this session: when loading started and how many files came from the network. */
const loadStats = new Map<
  TermId,
  { started: number; fetched: number; fromCache: boolean; reported: boolean }
>();
let onEvent: ((event: CatalogEvent) => void) | undefined;

const nowIso = () => new Date().toISOString();
const isNewer = (error: unknown): boolean =>
  error instanceof SchemaVersionError && error.newer;
const reasonOf = (error: unknown): DataError["reason"] =>
  error instanceof DataError ? error.reason : "invalid";
const failureOf = (error: unknown): CatalogFailureReason =>
  isNewer(error) ? "newer-data" : reasonOf(error);

export const useCatalog = create<CatalogState>()((set, get) => {
  const patchTerm = (
    termId: TermId,
    patch: (t: TermCatalog) => Partial<TermCatalog>,
  ) => {
    const current = get().byTerm[termId] ?? emptyTerm(termId);
    set({
      byTerm: { ...get().byTerm, [termId]: { ...current, ...patch(current) } },
    });
  };

  /**
   * A network result: note whether the server answered, and whether it
   * publishes a newer format than this tab reads (DATA.md §2.3).
   */
  const reached = <T>(promise: Promise<T>): Promise<T> =>
    promise.then(
      (value) => {
        if (get().network !== "online") set({ network: "online" });
        return value;
      },
      (error: unknown) => {
        if (reasonOf(error) === "network") set({ network: "offline" });
        else if (get().network !== "online") set({ network: "online" });
        if (isNewer(error)) set({ appStale: true });
        throw error;
      },
    );

  const stats = (termId: TermId) => {
    let s = loadStats.get(termId);
    if (!s) {
      s = {
        started: performance.now(),
        fetched: 0,
        fromCache: false,
        reported: false,
      };
      loadStats.set(termId, s);
    }
    return s;
  };

  /**
   * Cache writes run in the background, so what arrives shows at once;
   * `persistManifest` waits for them before committing a manifest.
   */
  const writes = new Set<Promise<void>>();
  const store = (files: CacheFile[]) => {
    const cache = get().cache;
    if (!cache) return;
    const write = cache.putFiles(files).finally(() => writes.delete(write));
    writes.add(write);
  };

  /**
   * A content-hashed file: the cache if it has it (validated when stored,
   * trusted after, DATA.md §5), else the network, then stored.
   */
  const hashed = async <T>(
    key: string,
    file: Omit<CacheFile, "key" | "data">,
    fetch: () => Promise<T>,
  ): Promise<T> => {
    const { cache } = get();
    const hit = cache ? (await cache.getFiles([key])).get(key) : undefined;
    if (hit !== undefined) return hit as T;
    const data = await reached(fetch());
    if (file.termId) stats(file.termId).fetched++;
    store([{ key, ...file, data }]);
    return data;
  };

  /** A fixed-name file: the cached copy (validated) if any, then the network. */
  const cachedPointer = async <T>(
    key: string,
    parse: (data: unknown) => T | null,
  ): Promise<T | null> => {
    const hit = await get().cache?.getPointer(key);
    return hit ? parse(hit.data) : null;
  };

  const catalogFile = (termId: TermId): Omit<CacheFile, "key" | "data"> => ({
    family: "catalog",
    termId,
  });

  const rebuild = (termId: TermId, manifest: Manifest) => {
    const loaded = chunks.get(termId) ?? new Map<DeptCode, readonly Course[]>();
    patchTerm(termId, (t) => ({
      index: buildCatalogIndex(termId, [...loaded.values()].flat()),
      complete: manifest.departments.every((d) => t.depts[d.code] === "ready"),
    }));
  };

  /**
   * Stores the manifest in the cache once every file it lists is cached, and
   * drops this term's files it no longer lists (DATA.md §5.1 step 4): a
   * cached manifest never points at files the browser doesn't have.
   */
  const persistManifest = async (termId: TermId) => {
    const { cache } = get();
    const t = get().byTerm[termId];
    if (!cache || !t?.manifest || t.manifestSource !== "network") return;
    const m = t.manifest;
    const keys = [
      ...m.departments.map((d) => deptChunkKey(termId, d.code, d.hash)),
      ...(m.seats ? [seatsKey(termId, m.seats.hash)] : []),
      ...(m.changes ? [changesKey(termId, m.changes.hash)] : []),
    ];
    await Promise.all(writes);
    const have = await cache.getFiles(keys);
    if (keys.some((k) => !have.has(k))) return;
    await cache.commit(
      { key: manifestKey(termId), data: m, checkedAt: t.checkedAt ?? nowIso() },
      [],
      { termId, family: "catalog", keep: new Set(keys) },
    );
  };

  /** Seats and changes for a manifest; a file that fails keeps the one on screen. */
  const loadSeatsAndChanges = async (
    reader: DataReader,
    termId: TermId,
    manifest: Manifest,
  ) => {
    const keep =
      <T>(fallback: T) =>
      (error: unknown) => {
        console.error(error);
        return fallback;
      };
    const t = get().byTerm[termId];
    const seatsHash = manifest.seats?.hash;
    const changesHash = manifest.changes?.hash;
    const [seats, changes] = await Promise.all([
      seatsHash
        ? hashed(seatsKey(termId, seatsHash), catalogFile(termId), () =>
            reader.seats(termId, seatsHash),
          ).catch(keep(t?.seats ?? null))
        : null,
      changesHash
        ? hashed(changesKey(termId, changesHash), catalogFile(termId), () =>
            reader.changes(termId, changesHash),
          ).catch(keep(t?.changes ?? null))
        : null,
    ]);
    patchTerm(termId, () => ({ seats, changes }));
  };

  /**
   * The server's manifest → what's on screen. Only departments already
   * loaded are refetched (when their hash changed); the rest load when asked.
   */
  const refreshTerm = (termId: TermId) =>
    once(`refresh:${termId}`, async () => {
      const { reader } = get();
      if (!reader) return;
      const current = get().byTerm[termId];
      let next: Manifest;
      try {
        next = await reached(reader.manifest(termId));
      } catch (error) {
        // Offline, a bad file, or a format this build doesn't read (newer:
        // the tab reloads when next shown; older: the jobs haven't
        // republished). Either way keep what's on screen (DATA.md §2.3).
        console.error(error);
        if (!current?.manifest) {
          patchTerm(termId, () => ({ manifestState: "error" }));
          onEvent?.({
            type: "catalog_load_failed",
            termId,
            reason: failureOf(error),
          });
        }
        return;
      }
      const old = current?.manifest ?? null;
      const diff = diffManifest(old ? cachedCatalogOf(old) : null, next);
      const loaded =
        chunks.get(termId) ?? new Map<DeptCode, readonly Course[]>();
      chunks.set(termId, loaded);

      // Departments the manifest dropped leave the index.
      for (const dept of diff.drop) loaded.delete(dept);
      // Changed departments are refetched now if they were loaded (or the
      // whole term was); the rest wait until something asks for them.
      const stale = diff.fetch.filter(
        (d) => current?.complete || current?.depts[d] === "ready",
      );
      patchTerm(termId, (t) => {
        const depts = { ...t.depts };
        for (const d of [...diff.drop, ...diff.fetch]) delete depts[d];
        return {
          manifest: next,
          manifestState: "ready",
          manifestSource: "network",
          checkedAt: nowIso(),
          depts,
        };
      });
      if (diff.seats || diff.changes || !old)
        await loadSeatsAndChanges(reader, termId, next);
      if (stale.length > 0) await ensureDepts(termId, stale);
      else if (diff.drop.length > 0 || diff.fetch.length > 0)
        rebuild(termId, next);
      await persistManifest(termId);
    });

  const loadManifest = (termId: TermId) =>
    once(`manifest:${termId}`, async () => {
      if (get().byTerm[termId]?.manifest) return;
      stats(termId);
      patchTerm(termId, () => ({ manifestState: "loading" }));
      const cached = await cachedPointer(manifestKey(termId), (data) => {
        const parsed = ManifestSchema.safeParse(data);
        return parsed.success &&
          parsed.data.schemaVersion === SCHEMA_VERSIONS.catalog
          ? parsed.data
          : null;
      });
      if (cached) {
        // Instant: the saved catalog, revalidated in the background.
        stats(termId).fromCache = true;
        patchTerm(termId, () => ({
          manifest: cached,
          manifestState: "ready",
          manifestSource: "cache",
        }));
        const { reader } = get();
        if (reader) await loadSeatsAndChanges(reader, termId, cached);
        void refreshTerm(termId);
        return;
      }
      await refreshTerm(termId);
    });

  const ensureDepts = async (termId: TermId, depts: readonly DeptCode[]) => {
    const { reader } = get();
    if (!reader) return;
    if (get().byTerm[termId]?.manifestState !== "ready")
      await loadManifest(termId);
    const manifest = get().byTerm[termId]?.manifest;
    if (!manifest) return;
    const wanted = [...new Set(depts)].flatMap((dept) => {
      const entry = manifest.departments.find((d) => d.code === dept);
      const state = get().byTerm[termId]?.depts[dept];
      return entry && state !== "ready" && state !== "loading" ? [entry] : [];
    });
    if (wanted.length === 0) {
      // Something else may be loading them; wait for it.
      await Promise.all(
        depts.map((d) => inFlight.get(`dept:${termId}:${d}`) ?? null),
      );
      return;
    }
    patchTerm(termId, (t) => {
      const next = { ...t.depts };
      for (const d of wanted) next[d.code] = "loading";
      return { depts: next };
    });
    const loaded = chunks.get(termId) ?? new Map<DeptCode, readonly Course[]>();
    chunks.set(termId, loaded);
    const results: Partial<Record<DeptCode, LoadState>> = {};
    // One cache read for the whole batch.
    const keys = wanted.map((e) => deptChunkKey(termId, e.code, e.hash));
    const cachedChunks =
      (await get().cache?.getFiles(keys)) ?? new Map<string, unknown>();
    await eachLimited(wanted, CONCURRENCY, (entry) =>
      once(`dept:${termId}:${entry.code}`, async () => {
        const key = deptChunkKey(termId, entry.code, entry.hash);
        try {
          let chunk = cachedChunks.get(key) as DeptChunk | undefined;
          if (!chunk) {
            chunk = await reached(
              reader.deptChunk(termId, entry.code, entry.hash),
            );
            stats(termId).fetched++;
            store([{ key, ...catalogFile(termId), data: chunk }]);
          }
          loaded.set(entry.code, chunk.courses);
          results[entry.code] = "ready";
        } catch (error) {
          // A department that fails keeps its previous chunk, if any.
          console.error(error);
          results[entry.code] = loaded.has(entry.code) ? "ready" : "error";
        }
      }),
    );
    // One index rebuild per batch, not per department.
    patchTerm(termId, (t) => {
      const deptStates = { ...t.depts, ...results };
      return {
        depts: deptStates,
        index: buildCatalogIndex(termId, [...loaded.values()].flat()),
        complete: manifest.departments.every(
          (d) => deptStates[d.code] === "ready",
        ),
      };
    });
  };

  const loadTerms = () =>
    once("terms", async () => {
      const { reader, cache } = get();
      if (!reader) return;
      if (!get().terms) set({ termsState: "loading", termsError: null });
      const cached = await cachedPointer(TERMS_KEY, (data) => {
        const parsed = TermsFileSchema.safeParse(data);
        return parsed.success &&
          parsed.data.schemaVersion === SCHEMA_VERSIONS.catalog
          ? parsed.data
          : null;
      });
      if (cached && !get().terms)
        set({ terms: cached.terms, termsState: "ready" });
      const fresh = reached(reader.terms()).then(
        async (file) => {
          set({ terms: file.terms, termsState: "ready", termsError: null });
          await cache?.putPointer(TERMS_KEY, file, nowIso());
        },
        (error: unknown) => {
          console.error(error);
          if (get().terms) return; // Saved terms on screen: quiet.
          const reason = failureOf(error);
          set({
            termsState: "error",
            termsError:
              reason === "network"
                ? "Couldn't reach terpsicle.com to load the course catalog. Check your connection and try again."
                : reason === "newer-data"
                  ? "Terpsicle has been updated since this page opened. Reload to load the course catalog."
                  : "The course catalog didn't load correctly. Try again in a minute.",
          });
          onEvent?.({ type: "catalog_load_failed", termId: null, reason });
        },
      );
      // With a saved list on screen, revalidate in the background.
      if (!cached) await fresh;
    });

  /** A fixed-name file that's cheap and rarely changes: cached copy, then network. */
  const pointerFile = async <T>(
    key: string,
    parse: (data: unknown) => T | null,
    fetch: () => Promise<T>,
    onValue: (value: T) => void,
  ): Promise<void> => {
    const cached = await cachedPointer(key, parse);
    if (cached) onValue(cached);
    const fresh = reached(fetch()).then(async (value) => {
      onValue(value);
      await get().cache?.putPointer(key, value, nowIso());
    });
    if (cached) {
      fresh.catch((error: unknown) => console.error(error));
      return;
    }
    await fresh;
  };

  const parseWith =
    <T>(
      schema: { safeParse(v: unknown): { success: boolean; data?: T } },
      family: SchemaFamily,
    ) =>
    (data: unknown): T | null => {
      const parsed = schema.safeParse(data);
      const value = parsed.success ? (parsed.data as T) : null;
      return value &&
        (value as { schemaVersion?: number }).schemaVersion ===
          SCHEMA_VERSIONS[family]
        ? value
        : null;
    };

  let planetTerpManifest: Promise<PlanetTerpManifest> | null = null;
  const loadPlanetTerpManifest = (reader: DataReader) => {
    planetTerpManifest ??= new Promise<PlanetTerpManifest>(
      (resolve, reject) => {
        let settled = false;
        pointerFile(
          PLANETTERP_MANIFEST_KEY,
          parseWith<PlanetTerpManifest>(PlanetTerpManifestSchema, "planetterp"),
          () => reader.planetTerpManifest(),
          (m) => {
            // Cached first, then revalidated: the newest word on freshness wins.
            set({ planetTerpSource: m.source ?? null });
            if (!settled) {
              settled = true;
              resolve(m);
            }
          },
        ).catch((error: unknown) => {
          planetTerpManifest = null;
          if (!settled) reject(error);
        });
      },
    );
    return planetTerpManifest;
  };

  return {
    ...INITIAL_CATALOG_STATE,

    setReader: (reader, options = {}) => {
      inFlight.clear();
      chunks.clear();
      loadStats.clear();
      planetTerpManifest = null;
      onEvent = options.onEvent;
      const cache = options.cache
        ? versionedCache(options.cache, SCHEMA_VERSIONS)
        : null;
      set({ ...INITIAL_CATALOG_STATE, reader, cache });
    },

    loadTerms,
    ensureDepts,
    refreshTerm,

    ensureTerm: async (termId, first = []) => {
      const { reader } = get();
      if (!reader) return;
      if (get().byTerm[termId]?.manifestState !== "ready")
        await loadManifest(termId);
      const manifest = get().byTerm[termId]?.manifest;
      if (!manifest) return;
      if (first.length > 0) await ensureDepts(termId, first);
      await ensureDepts(
        termId,
        manifest.departments.map((d) => d.code),
      );
      const s = stats(termId);
      if (!s.reported && get().byTerm[termId]?.complete) {
        s.reported = true;
        onEvent?.({
          type: "catalog_loaded",
          termId,
          fromCache: s.fromCache,
          deptsFetched: s.fetched,
          ms: Math.round(performance.now() - s.started),
        });
      }
      await persistManifest(termId);
    },

    retry: async () => {
      inFlight.delete("terms");
      if (get().termsState === "error") await loadTerms();
      for (const [termId, t] of Object.entries(get().byTerm)) {
        if (t?.manifestState === "error") {
          inFlight.delete(`manifest:${termId}`);
          await get().ensureTerm(termId);
        }
      }
    },

    ensureCampus: () =>
      once("campus", async () => {
        const { reader, campusState } = get();
        if (!reader || campusState === "ready") return;
        set({ campusState: "loading" });
        try {
          let manifest: ReturnType<typeof GeoManifestSchema.parse> | null =
            null;
          await pointerFile(
            GEO_MANIFEST_KEY,
            parseWith(GeoManifestSchema, "geo"),
            () => reader.geoManifest(),
            (m) => {
              manifest ??= m;
            },
          ).catch((error: unknown) => {
            if (!manifest) throw error;
          });
          const m = manifest as ReturnType<
            typeof GeoManifestSchema.parse
          > | null;
          if (!m) throw new Error("No geo manifest");
          const geo = { family: "geo" as const, termId: null };
          const [buildings, routes] = await Promise.all([
            hashed(buildingsKey(m.buildings.hash), geo, () =>
              reader.buildings(m.buildings.hash),
            ).then((b) => BuildingsFileSchema.parse(b)),
            m.routes
              ? hashed(routesKey(m.routes.hash), geo, () =>
                  reader.routes(m.routes?.hash ?? ""),
                )
              : null,
          ]);
          set({
            campus: campusMap(routes ? decodeRoutes(routes) : null, buildings),
            campusState: "ready",
          });
        } catch (error) {
          // Travel then reads "No route data yet"; nothing else depends on it.
          console.error(error);
          set({ campusState: "error" });
        }
      }),

    ensureInstructors: (dept) =>
      once(`instructors:${dept}`, async () => {
        const { reader } = get();
        if (!reader || get().instructorsState[dept] === "ready") return;
        const setState = (state: LoadState) =>
          set({
            instructorsState: { ...get().instructorsState, [dept]: state },
          });
        setState("loading");
        try {
          const manifest = await loadPlanetTerpManifest(reader);
          const entry = manifest.departments.find((d) => d.code === dept);
          if (!entry) {
            setState("ready");
            return;
          }
          const file = await hashed(
            planetTerpDeptKey(dept, entry.hash),
            { family: "planetterp", termId: null },
            () => reader.planetTerpDept(dept, entry.hash),
          );
          set({ instructors: { ...get().instructors, [dept]: file } });
          setState("ready");
        } catch (error) {
          // Ratings and grades are extras: the course still shows without them.
          console.error(error);
          setState("error");
        }
      }),

    ensureCalendar: (termId) =>
      once(`calendar:${termId}`, async () => {
        const { reader } = get();
        if (!reader || get().calendarsState[termId] === "ready") return;
        const setState = (state: LoadState) =>
          set({ calendarsState: { ...get().calendarsState, [termId]: state } });
        setState("loading");
        try {
          await pointerFile(
            calendarKey(termId),
            parseWith<AcademicCalendar>(AcademicCalendarSchema, "calendar"),
            () => reader.calendar(termId),
            (calendar) =>
              set({ calendars: { ...get().calendars, [termId]: calendar } }),
          );
          setState("ready");
        } catch (error) {
          // No file yet means the provost hasn't published the dates: ready,
          // with no calendar, which export says plainly (SPEC §3.0).
          const missing = reasonOf(error) === "missing";
          if (!missing) console.error(error);
          setState(missing || get().calendars[termId] ? "ready" : "error");
        }
      }),

    loadRouteGeometry: async (from, to, mode) => {
      const { reader } = get();
      if (!reader) return null;
      try {
        // Fixed name with a day's max-age: the browser's HTTP cache keeps it.
        return await reached(reader.routeGeometry(from, to, mode));
      } catch (error) {
        // Missing geometry hides the map; never draw a straight line (DATA.md §4.3).
        if (reasonOf(error) !== "missing") console.error(error);
        return null;
      }
    },
  };
});

/** Department of a course code (DATA.md §1). */
export const deptOf = (code: CourseCode): DeptCode => code.slice(0, 4);
