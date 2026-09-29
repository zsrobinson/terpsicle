import { create } from "zustand";
import {
  buildCatalogIndex,
  type CatalogIndex,
  cachedCatalogOf,
  diffManifest,
} from "~/core/catalog";
import {
  type ChangesFile,
  type ContentHash,
  type Course,
  type CourseCode,
  changesKey,
  type DeptChunk,
  type DeptCode,
  deptChunkKey,
  type Manifest,
  ManifestSchema,
  manifestKey,
  SCHEMA_VERSIONS,
  type SeatsFile,
  seatsKey,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";
import { type CacheFile, type DataCache, versionedCache } from "./data-cache";
import {
  DataError,
  type DataReader,
  type ReadPriority,
  SchemaVersionError,
} from "./data-source";
import { whenNewerFormat } from "./query/published";

// Published data (DATA.md §2, §5.1): the term list; per term its manifest,
// seats, changes and departments (as a core CatalogIndex); the campus map;
// PlanetTerp per department; academic calendars.
//
// Every read goes through the same path, in mock and live mode alike:
// the IndexedDB cache first (instant startup, works offline), then the
// network to revalidate. Manifests are diffed against what's loaded (core
// `diffManifest`), so a poll fetches only the files whose hash changed.
// Files are validated before use; a file that fails keeps the previous one.
//
// Departments load in two ways (DATA.md §5.1). What's on screen asks for its
// own (`ensureDepts`: a course's details, the plan's courses, a shared link)
// and sees them as soon as they arrive. The rest of the term follows in the
// background (`ensureTerm`), after whatever was asked for first, at a low
// fetch priority, and shows when it's all in: search waits for that.

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
  /**
   * Every department has loaded or failed at least once this session, so the
   * index is the whole term (less any that failed): what search waits for.
   * Stays true while a poll refetches changed departments.
   */
  settled: boolean;
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
  /** The last request to the server failed: show saved data, and say so quietly. */
  network: "online" | "offline";
  /**
   * The server publishes a newer data format than this tab understands
   * (DATA.md §2.3): keep what's loaded, and reload at the next visibility change.
   */
  appStale: boolean;

  setReader: (reader: DataReader, options?: CatalogOptions) => void;
  loadTerms: () => Promise<void>;
  /**
   * Loads the term's manifest, then the given departments, ahead of the
   * background load of the rest, and shows them as soon as they're in.
   */
  ensureDepts: (termId: TermId, depts: readonly DeptCode[]) => Promise<void>;
  /**
   * Loads every department of the term (search, fit and problems need them
   * all), `first` ones first: the plan's departments, and anything else
   * already asked for, before the rest.
   */
  ensureTerm: (termId: TermId, first?: readonly DeptCode[]) => Promise<void>;
  /** Revalidates the term's manifest and fetches only what changed (the seat poll). */
  refreshTerm: (termId: TermId) => Promise<void>;
  /** Tries again after a failed first load. */
  retry: () => Promise<void>;
}

/**
 * DATA.md §5.1: how many department files the background load fetches at
 * once. /data is served over HTTP/2, where the browser's six-per-host limit
 * doesn't apply, and the ~200 files are small, so latency, not bandwidth,
 * bounds the load.
 */
const CONCURRENCY = 16;

function emptyTerm(termId: TermId): TermCatalog {
  return {
    manifest: null,
    manifestState: "loading",
    manifestSource: null,
    checkedAt: null,
    depts: {},
    index: buildCatalogIndex(termId, []),
    complete: false,
    settled: false,
    seats: null,
    changes: null,
  };
}

const inFlight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
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
  network: "online",
  appStale: false,
} satisfies Partial<CatalogState>;

/** A department's courses, and the hash they were loaded at. */
interface LoadedDept {
  hash: ContentHash;
  courses: readonly Course[];
}
/** Loaded department chunks, per term, to rebuild the index from. */
const chunks = new Map<TermId, Map<DeptCode, LoadedDept>>();
const termChunks = (termId: TermId): Map<DeptCode, LoadedDept> => {
  let loaded = chunks.get(termId);
  if (!loaded) {
    loaded = new Map();
    chunks.set(termId, loaded);
  }
  return loaded;
};
const indexOf = (termId: TermId, loaded: Map<DeptCode, LoadedDept>) =>
  buildCatalogIndex(
    termId,
    [...loaded.values()].flatMap((d) => d.courses),
  );
/**
 * Per term, the `ensureDepts` calls still loading: the background load of
 * the rest waits for them, so what's on screen is fetched first.
 */
const asked = new Map<TermId, Set<Promise<void>>>();
/** Per term, a first load's seats and changes, which `ensureTerm` waits for. */
const firstSeats = new Map<TermId, Promise<void>>();
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
    const loaded = termChunks(termId);
    patchTerm(termId, (t) => ({
      index: indexOf(termId, loaded),
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
      const loaded = termChunks(termId);

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
      if (!old) {
        // A first load: departments needn't wait for seats and changes.
        // `ensureTerm` waits for them before it commits the manifest.
        const seats = loadSeatsAndChanges(reader, termId, next).finally(() =>
          firstSeats.delete(termId),
        );
        firstSeats.set(termId, seats);
      } else if (diff.seats || diff.changes)
        await loadSeatsAndChanges(reader, termId, next);
      if (stale.length > 0) await loadDepts(termId, stale, "auto");
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

  /** Every department has loaded or failed. */
  const isSettled = (
    manifest: Manifest,
    termId: TermId,
    states = get().byTerm[termId]?.depts ?? {},
  ) =>
    manifest.departments.every(
      (d) => states[d.code] === "ready" || states[d.code] === "error",
    );

  /**
   * One department's chunk: the cache (read by the caller, for a whole batch)
   * or the network. A chunk already loaded at this hash is never fetched
   * again, so a department asked for twice, by what's on screen and by the
   * background load, is fetched once.
   */
  const loadDept = (
    reader: DataReader,
    termId: TermId,
    entry: Manifest["departments"][number],
    cached: DeptChunk | undefined,
    priority: ReadPriority,
  ) =>
    once(
      `dept:${termId}:${entry.code}:${entry.hash}`,
      async (): Promise<LoadState> => {
        const loaded = termChunks(termId);
        if (loaded.get(entry.code)?.hash === entry.hash) return "ready";
        try {
          let chunk = cached;
          if (!chunk) {
            chunk = await reached(
              reader.deptChunk(termId, entry.code, entry.hash, { priority }),
            );
            stats(termId).fetched++;
            store([
              {
                key: deptChunkKey(termId, entry.code, entry.hash),
                ...catalogFile(termId),
                data: chunk,
              },
            ]);
          }
          loaded.set(entry.code, { hash: entry.hash, courses: chunk.courses });
          return "ready";
        } catch (error) {
          // A department that fails keeps its previous chunk, if any.
          console.error(error);
          return loaded.has(entry.code) ? "ready" : "error";
        }
      },
    );

  /** Loads departments and shows them together once they're all in. */
  const loadDepts = async (
    termId: TermId,
    depts: readonly DeptCode[],
    priority: ReadPriority,
  ) => {
    const { reader } = get();
    if (!reader) return;
    if (get().byTerm[termId]?.manifestState !== "ready")
      await loadManifest(termId);
    const manifest = get().byTerm[termId]?.manifest;
    if (!manifest) return;
    const wanted = [...new Set(depts)].flatMap((dept) => {
      const entry = manifest.departments.find((d) => d.code === dept);
      return entry && get().byTerm[termId]?.depts[dept] !== "ready"
        ? [entry]
        : [];
    });
    if (wanted.length === 0) {
      // Nothing left to fetch (or nothing listed): the term may have just
      // settled without a batch of its own.
      if (!get().byTerm[termId]?.settled && isSettled(manifest, termId))
        patchTerm(termId, (t) => ({
          settled: true,
          complete: manifest.departments.every(
            (d) => t.depts[d.code] === "ready",
          ),
        }));
      return;
    }
    patchTerm(termId, (t) => {
      const next = { ...t.depts };
      for (const d of wanted) next[d.code] = "loading";
      return { depts: next };
    });
    // One cache read for the whole batch.
    const keys = wanted.map((e) => deptChunkKey(termId, e.code, e.hash));
    const cachedChunks =
      (await get().cache?.getFiles(keys)) ?? new Map<string, unknown>();
    const results: Partial<Record<DeptCode, LoadState>> = {};
    await eachLimited(wanted, CONCURRENCY, async (entry) => {
      const key = deptChunkKey(termId, entry.code, entry.hash);
      results[entry.code] = await loadDept(
        reader,
        termId,
        entry,
        cachedChunks.get(key) as DeptChunk | undefined,
        priority,
      );
    });
    // On a first load, sections show with their seats, never "Seats unknown"
    // for a moment. The two load side by side, so this rarely waits.
    await firstSeats.get(termId);
    // One index rebuild per batch, not per department.
    const loaded = termChunks(termId);
    patchTerm(termId, (t) => {
      const deptStates = { ...t.depts, ...results };
      return {
        depts: deptStates,
        index: indexOf(termId, loaded),
        complete: manifest.departments.every(
          (d) => deptStates[d.code] === "ready",
        ),
        settled: t.settled || isSettled(manifest, termId, deptStates),
      };
    });
  };

  const ensureDepts = (termId: TermId, depts: readonly DeptCode[]) => {
    const load = loadDepts(termId, depts, "auto");
    const pending = asked.get(termId) ?? new Set<Promise<void>>();
    asked.set(termId, pending);
    pending.add(load);
    const done = () => pending.delete(load);
    load.then(done, done);
    return load;
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

  return {
    ...INITIAL_CATALOG_STATE,

    setReader: (reader, options = {}) => {
      inFlight.clear();
      chunks.clear();
      asked.clear();
      firstSeats.clear();
      loadStats.clear();
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
      // Whatever's on screen asked for goes first; a second call while the
      // background load runs (the plan gained a department) joins it.
      await Promise.all(asked.get(termId) ?? []);
      await once(`term:${termId}`, () =>
        loadDepts(
          termId,
          manifest.departments.map((d) => d.code),
          "low",
        ),
      );
      await firstSeats.get(termId);
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
  };
});

// The query cache's reads (PlanetTerp, the campus map, calendars, the
// course index) find a newer format too: the same signal, the same Reload.
whenNewerFormat(() => {
  if (!useCatalog.getState().appStale) useCatalog.setState({ appStale: true });
});

/** Department of a course code (DATA.md §1). */
export const deptOf = (code: CourseCode): DeptCode => code.slice(0, 4);

/** How long anything waiting on the term list waits before going ahead. */
export const TERMS_SETTLE_MS = 10_000;

/**
 * Resolves once the term list has loaded or failed, or after `ms` anyway,
 * then once more after the render that follows (a macrotask), so effects
 * that need a term have run: a first visit's Plan A is made only once a term
 * is known (`useDefaultPlan`).
 */
export function termsSettled(ms: number = TERMS_SETTLE_MS): Promise<void> {
  const settled = () => {
    const { termsState } = useCatalog.getState();
    return termsState === "ready" || termsState === "error";
  };
  return new Promise<void>((resolve) => {
    let stop = () => {};
    const done = () => {
      clearTimeout(timer);
      stop();
      setTimeout(resolve, 0);
    };
    const timer = setTimeout(done, ms);
    if (settled()) return done();
    stop = useCatalog.subscribe(() => {
      if (settled()) done();
    });
  });
}
