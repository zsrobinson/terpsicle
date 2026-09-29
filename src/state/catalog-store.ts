import {
  type QueryClient,
  QueryObserver,
  type QueryState,
} from "@tanstack/react-query";
import { create } from "zustand";
import {
  buildCatalogIndex,
  type CatalogIndex,
  cachedCatalogOf,
  diffManifest,
} from "~/core/catalog";
import type {
  ChangesFile,
  ContentHash,
  Course,
  CourseCode,
  DeptCode,
  Manifest,
  SeatsFile,
  Term,
  TermId,
  TermsFile,
} from "~/core/schema";
import {
  DataError,
  type DataSource,
  type ReadPriority,
  SchemaVersionError,
} from "./data-source";
import {
  changesQuery,
  deptChunkQuery,
  manifestQuery,
  seatsQuery,
  termsQuery,
} from "./query/catalog";
import { type PollPlatform, pollManifest } from "./query/catalog-poll";
import { preloadPublished } from "./query/persister";
import { whenNewerFormat } from "./query/published";

// The term catalog on screen (DATA.md §2, §5.1): the term list, and per
// term its manifest, seats, changes and departments (as a core
// CatalogIndex).
//
// Every file is a query (./query/catalog.ts): shown from this device's
// copy at once, checked with the server, saved, and dropped when the
// manifest stops listing it, all by TanStack Query and its persister
// (DATA.md §5.5). This store keeps only what's built from them: which
// departments are in, the index, and whether the term is whole yet. A
// new manifest (a poll, a check on load, another tab's) is diffed against
// the one on screen (core `diffManifest`), and only departments already
// loaded whose hash changed are read again.
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
  onEvent?: (event: CatalogEvent) => void;
  /** Web Locks and the channel for the seat poll; tests pass their own. */
  poll?: PollPlatform;
}

export interface CatalogState {
  /** The page's query client, which holds every file. */
  client: QueryClient | null;
  /** Where the files come from (mock or live). */
  source: DataSource | null;
  terms: readonly Term[] | null;
  termsState: LoadState | "idle";
  /** Specific, plain words for the person, when terms can't load. */
  termsError: string | null;
  byTerm: Readonly<Partial<Record<TermId, TermCatalog>>>;
  /** The last request to the server failed: show saved data, and say so quietly. */
  network: "online" | "offline";
  /**
   * The server publishes a newer data format than this tab understands
   * (DATA.md §2.3): any published query's newer-format error sets it,
   * the manifest's first. Keep what's loaded, and reload at the next
   * visibility change.
   */
  appStale: boolean;

  /** Reads the catalog from `source` through `client` from now on. */
  connect: (
    client: QueryClient,
    source: DataSource,
    options?: CatalogOptions,
  ) => void;
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
  /** Asks for the term's manifest now and brings what changed. */
  refreshTerm: (termId: TermId) => Promise<void>;
  /**
   * The seat poll for the term on screen (./query/catalog-poll.ts), until
   * the returned function stops it.
   */
  pollTerm: (termId: TermId) => () => void;
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
    depts: {},
    index: buildCatalogIndex(termId, []),
    complete: false,
    settled: false,
    seats: null,
    changes: null,
  };
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
  client: null,
  source: null,
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
/**
 * Per term, the background load of the whole term, which a second
 * `ensureTerm` (the plan gained a department) joins rather than starting
 * another batch of 16. Each file is Query's to fetch once; this is only
 * the order of the batch.
 */
const background = new Map<TermId, Promise<void>>();
/**
 * Per term, the manifest being brought on screen (its changed departments
 * read again), so the query's observer and a caller that waits share it.
 */
const applying = new Map<TermId, { manifest: Manifest; done: Promise<void> }>();
/** Per term, this session: when loading started and what came from the network. */
const loadStats = new Map<
  TermId,
  {
    started: number;
    /** The term's files read from the server (not the manifest). */
    fetched: number;
    /** Manifest reads that came back from the server. */
    manifestReads: number;
    fromCache: boolean;
    reported: boolean;
  }
>();
const stats = (termId: TermId) => {
  let s = loadStats.get(termId);
  if (!s) {
    s = {
      started: performance.now(),
      fetched: 0,
      manifestReads: 0,
      fromCache: false,
      reported: false,
    };
    loadStats.set(termId, s);
  }
  return s;
};
/** Observers on the terms and each term's manifest, stopped on `connect`. */
const watching = new Map<string, () => void>();
let onEvent: ((event: CatalogEvent) => void) | undefined;
let pollPlatform: PollPlatform | undefined;
/** When this page connected: data from before it came from this device. */
let connectedAt = 0;

/**
 * The source as the store reads it: each term file the server answers
 * with counts toward that term's `catalog_loaded` (docs/ANALYTICS.md), and
 * a restored copy doesn't, since nothing is read.
 */
function counted(source: DataSource): DataSource {
  return {
    kind: source.kind,
    readBinary: (key) => source.readBinary(key),
    readJson: async (key, options) => {
      const data = await source.readJson(key, options);
      const match = /^catalog\/([^/]+)\/(.+)$/.exec(key);
      if (match?.[1] && match[2]) {
        const s = stats(match[1]);
        if (match[2] === "manifest.json") s.manifestReads++;
        else s.fetched++;
      }
      return data;
    },
  };
}

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
   * Whether the server answered, from a query's latest outcome: a network
   * failure after the data it shows means offline; data fetched on this
   * page means online again. A copy from disk says nothing either way.
   */
  const noteReach = (state: QueryState<unknown, Error> | undefined) => {
    if (!state) return;
    if (state.error && state.errorUpdatedAt >= state.dataUpdatedAt) {
      if (reasonOf(state.error) === "network" && get().network !== "offline")
        set({ network: "offline" });
    } else if (
      state.data !== undefined &&
      state.dataUpdatedAt >= connectedAt &&
      get().network !== "online"
    )
      set({ network: "online" });
  };
  /** A read something waits for: a network failure means offline. */
  const reached = <T>(promise: Promise<T>): Promise<T> =>
    promise.catch((error: unknown) => {
      if (reasonOf(error) === "network" && get().network !== "offline")
        set({ network: "offline" });
      throw error;
    });

  /**
   * The term's manifest as the cache holds it. A fetch resolves with what
   * the server sent; the cache keeps a structurally shared copy, which is
   * what its observer (`syncManifest`) sees: one object, so one apply.
   */
  const cached = (termId: TermId): Manifest | undefined => {
    const { client, source } = get();
    return client && source
      ? client.getQueryData(manifestQuery(source, termId).queryKey)
      : undefined;
  };

  /** The hash the manifest on screen lists for a department. */
  const listedHash = (termId: TermId, dept: DeptCode) =>
    get().byTerm[termId]?.manifest?.departments.find((d) => d.code === dept)
      ?.hash;

  const rebuild = (termId: TermId, manifest: Manifest) => {
    const loaded = termChunks(termId);
    patchTerm(termId, (t) => ({
      index: indexOf(termId, loaded),
      complete: manifest.departments.every((d) => t.depts[d.code] === "ready"),
    }));
  };

  /**
   * Seats and changes for a manifest; a file that fails keeps the one on
   * screen. Only files the manifest on screen still lists go on it: a
   * newer one may have come while these loaded.
   */
  const seatsAndChanges = async (termId: TermId, manifest: Manifest) => {
    const { client, source } = get();
    if (!client || !source) return;
    const t = get().byTerm[termId];
    const keep =
      <T>(fallback: T) =>
      (error: unknown) => {
        console.error(error);
        return fallback;
      };
    const seatsHash = manifest.seats?.hash;
    const changesHash = manifest.changes?.hash;
    const [seats, changes] = await Promise.all([
      seatsHash
        ? reached(
            client.ensureQueryData(seatsQuery(source, termId, seatsHash)),
          ).catch(keep(t?.seats ?? null))
        : null,
      changesHash
        ? reached(
            client.ensureQueryData(changesQuery(source, termId, changesHash)),
          ).catch(keep(t?.changes ?? null))
        : null,
    ]);
    const now = get().byTerm[termId];
    const patch: Partial<TermCatalog> = {};
    if (now && now.manifest?.seats?.hash === seatsHash && now.seats !== seats)
      patch.seats = seats;
    if (
      now &&
      now.manifest?.changes?.hash === changesHash &&
      now.changes !== changes
    )
      patch.changes = changes;
    if (Object.keys(patch).length > 0) patchTerm(termId, () => patch);
  };

  /**
   * A manifest → what's on screen, wherever it came from (disk, the
   * server, another tab). Only departments already loaded are read again
   * (when their hash changed); the rest load when asked.
   */
  const applyManifest = (termId: TermId, next: Manifest): Promise<void> => {
    // The query's observer may have started on this same manifest: a
    // caller that waits (a refresh, a first load) waits for that.
    const running = applying.get(termId);
    if (running?.manifest === next) return running.done;
    if (get().byTerm[termId]?.manifest === next) return Promise.resolve();
    const done: Promise<void> = bringOn(termId, next).finally(() => {
      if (applying.get(termId)?.done === done) applying.delete(termId);
    });
    applying.set(termId, { manifest: next, done });
    return done;
  };

  const bringOn = async (termId: TermId, next: Manifest) => {
    const current = get().byTerm[termId];
    const old = current?.manifest ?? null;
    const diff = diffManifest(old ? cachedCatalogOf(old) : null, next);
    const loaded = termChunks(termId);
    // Departments the manifest dropped leave the index.
    for (const dept of diff.drop) loaded.delete(dept);
    // Changed departments are read again now if they were loaded (or the
    // whole term was); the rest wait until something asks for them.
    const stale = diff.fetch.filter(
      (d) => current?.complete || current?.depts[d] === "ready",
    );
    patchTerm(termId, (t) => {
      const depts = { ...t.depts };
      for (const d of [...diff.drop, ...diff.fetch]) delete depts[d];
      return { manifest: next, manifestState: "ready", depts };
    });
    // A first load's departments don't wait for seats and changes; a
    // batch shows once they're in too (`loadDepts`).
    if (!old) void seatsAndChanges(termId, next);
    else if (diff.seats || diff.changes) await seatsAndChanges(termId, next);
    if (stale.length > 0) await loadDepts(termId, stale, "auto");
    else if (diff.drop.length > 0 || diff.fetch.length > 0)
      rebuild(termId, next);
  };

  /** A term's manifest didn't load; with none on screen, the term failed. */
  const manifestFailed = (termId: TermId, error: unknown) => {
    const t = get().byTerm[termId];
    if (t?.manifest || t?.manifestState === "error") return;
    // Offline, a bad file, or a format this build doesn't read (newer: the
    // tab reloads when next shown; older: the jobs haven't republished).
    patchTerm(termId, () => ({ manifestState: "error" }));
    onEvent?.({
      type: "catalog_load_failed",
      termId,
      reason: failureOf(error),
    });
  };

  /**
   * Departments shown at an older version than the manifest lists (their
   * new file didn't load, so the old one stayed) whose new file has since
   * come in, from a later poll's retry: shown at the new one now.
   */
  const catchUp = (termId: TermId) => {
    const { client, source } = get();
    const manifest = get().byTerm[termId]?.manifest;
    if (!client || !source || !manifest) return;
    const loaded = termChunks(termId);
    let moved = false;
    for (const d of manifest.departments) {
      const have = loaded.get(d.code);
      if (!have || have.hash === d.hash) continue;
      const chunk = client.getQueryData(
        deptChunkQuery(source, termId, d).queryKey,
      );
      if (!chunk) continue;
      loaded.set(d.code, { hash: d.hash, courses: chunk.courses });
      moved = true;
    }
    if (moved) rebuild(termId, manifest);
  };

  /** The manifest query's latest outcome → the term on screen. */
  const syncManifest = (termId: TermId) => {
    const { client, source } = get();
    if (!client || !source) return;
    const state = client.getQueryState<Manifest>(
      manifestQuery(source, termId).queryKey,
    );
    noteReach(state);
    if (state?.data)
      void applyManifest(termId, state.data).then(() => catchUp(termId));
    else if (state?.error && state.fetchStatus === "idle")
      manifestFailed(termId, state.error);
  };

  /** Follows a term's manifest query for the page's life, fetching nothing itself. */
  const watchManifest = (termId: TermId) => {
    const { client, source } = get();
    const id = `manifest:${termId}`;
    if (!client || !source || watching.has(id)) return;
    const observer = new QueryObserver(client, {
      ...manifestQuery(source, termId),
      enabled: false,
    });
    watching.set(
      id,
      observer.subscribe(() => syncManifest(termId)),
    );
  };

  const loadManifest = async (termId: TermId) => {
    const { client, source } = get();
    if (!client || !source || get().byTerm[termId]?.manifest) return;
    const s = stats(termId);
    const reads = s.manifestReads;
    if (get().byTerm[termId]?.manifestState !== "loading")
      patchTerm(termId, () => ({ manifestState: "loading" }));
    watchManifest(termId);
    // The term's saved files in one read, before the manifest and ~200
    // departments restore from it one by one.
    if (!client.getQueryData(manifestQuery(source, termId).queryKey))
      await preloadPublished("catalog", source.kind, `catalog/${termId}/`);
    try {
      const manifest = await reached(
        client.ensureQueryData(manifestQuery(source, termId)),
      );
      // Nothing came back from the server: this device's copy, which the
      // query checks with the server in the background.
      if (s.manifestReads === reads) s.fromCache = true;
      await applyManifest(termId, cached(termId) ?? manifest);
    } catch (error) {
      console.error(error);
      manifestFailed(termId, error);
    }
  };

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
   * One department's chunk. A chunk already loaded at this hash is never
   * read again, and one being read is Query's to share, so a department
   * asked for twice, by what's on screen and by the background load, is
   * fetched once.
   */
  const loadDept = async (
    termId: TermId,
    entry: Manifest["departments"][number],
    priority: ReadPriority,
  ): Promise<LoadState> => {
    const { client, source } = get();
    const loaded = termChunks(termId);
    if (loaded.get(entry.code)?.hash === entry.hash) return "ready";
    if (!client || !source) return "error";
    try {
      const chunk = await reached(
        client.ensureQueryData(deptChunkQuery(source, termId, entry, priority)),
      );
      // Not over a newer version that came in meanwhile.
      if (listedHash(termId, entry.code) === entry.hash)
        loaded.set(entry.code, { hash: entry.hash, courses: chunk.courses });
      return "ready";
    } catch (error) {
      // A department that fails keeps its previous chunk, if any.
      console.error(error);
      return loaded.has(entry.code) ? "ready" : "error";
    }
  };

  /** Loads departments and shows them together once they're all in. */
  const loadDepts = async (
    termId: TermId,
    depts: readonly DeptCode[],
    priority: ReadPriority,
  ) => {
    if (!get().client) return;
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
    const results: Partial<Record<DeptCode, LoadState>> = {};
    await eachLimited(wanted, CONCURRENCY, async (entry) => {
      const state = await loadDept(termId, entry, priority);
      // A newer manifest may have moved it on: that one's load says.
      if (listedHash(termId, entry.code) === entry.hash)
        results[entry.code] = state;
    });
    // Sections show with their seats, never "Seats unknown" for a moment.
    // The two load side by side on a first load, so this rarely waits.
    const now = get().byTerm[termId]?.manifest ?? manifest;
    await seatsAndChanges(termId, now);
    // One index rebuild per batch, not per department.
    const loaded = termChunks(termId);
    patchTerm(termId, (t) => {
      const deptStates = { ...t.depts, ...results };
      const listed = t.manifest ?? now;
      return {
        depts: deptStates,
        index: indexOf(termId, loaded),
        complete: listed.departments.every(
          (d) => deptStates[d.code] === "ready",
        ),
        settled: t.settled || isSettled(listed, termId, deptStates),
      };
    });
    // Departments a newer manifest moved on while they loaded: what was
    // asked for is the department, so it loads at the hash listed now.
    const moved = wanted.flatMap((e) => {
      const hash = listedHash(termId, e.code);
      return hash && hash !== e.hash ? [e.code] : [];
    });
    if (moved.length > 0) await loadDepts(termId, moved, priority);
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

  /** The terms query's latest outcome → the list on screen. */
  const syncTerms = () => {
    const { client, source } = get();
    if (!client || !source) return;
    const state = client.getQueryState<TermsFile>(termsQuery(source).queryKey);
    noteReach(state);
    if (state?.data) {
      if (get().terms !== state.data.terms || get().termsState !== "ready")
        set({ terms: state.data.terms, termsState: "ready", termsError: null });
    } else if (state?.error && state.fetchStatus === "idle")
      termsFailed(state.error);
  };

  const termsFailed = (error: unknown) => {
    // Saved terms on screen: quiet.
    if (get().terms || get().termsState === "error") return;
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
  };

  const loadTerms = async () => {
    const { client, source } = get();
    if (!client || !source) return;
    if (!watching.has("terms")) {
      const observer = new QueryObserver(client, {
        ...termsQuery(source),
        enabled: false,
      });
      watching.set("terms", observer.subscribe(syncTerms));
    }
    if (!get().terms) set({ termsState: "loading", termsError: null });
    try {
      // This device's list at once if it has one, checked in the background.
      await reached(client.ensureQueryData(termsQuery(source)));
      syncTerms();
    } catch (error) {
      console.error(error);
      termsFailed(error);
    }
  };

  return {
    ...INITIAL_CATALOG_STATE,

    connect: (client, source, options = {}) => {
      for (const stop of watching.values()) stop();
      watching.clear();
      chunks.clear();
      asked.clear();
      background.clear();
      applying.clear();
      loadStats.clear();
      onEvent = options.onEvent;
      pollPlatform = options.poll;
      connectedAt = Date.now();
      set({ ...INITIAL_CATALOG_STATE, client, source: counted(source) });
    },

    loadTerms,
    ensureDepts,

    refreshTerm: async (termId) => {
      const { client, source } = get();
      if (!client || !source) return;
      watchManifest(termId);
      try {
        const manifest = await reached(
          client.fetchQuery({ ...manifestQuery(source, termId), staleTime: 0 }),
        );
        await applyManifest(termId, cached(termId) ?? manifest);
      } catch (error) {
        // Offline, a bad file, or a newer format: keep what's on screen
        // (DATA.md §2.3).
        console.error(error);
        manifestFailed(termId, error);
      }
    },

    pollTerm: (termId) => {
      const { client, source } = get();
      if (!client || !source) return () => {};
      watchManifest(termId);
      return pollManifest(
        client,
        source,
        termId,
        pollPlatform,
        () => get().appStale,
      );
    },

    ensureTerm: async (termId, first = []) => {
      if (!get().client) return;
      if (get().byTerm[termId]?.manifestState !== "ready")
        await loadManifest(termId);
      const manifest = get().byTerm[termId]?.manifest;
      if (!manifest) return;
      if (first.length > 0) await ensureDepts(termId, first);
      // Whatever's on screen asked for goes first; a second call while the
      // background load runs (the plan gained a department) joins it.
      await Promise.all(asked.get(termId) ?? []);
      let run = background.get(termId);
      if (!run) {
        run = loadDepts(
          termId,
          manifest.departments.map((d) => d.code),
          "low",
        ).finally(() => background.delete(termId));
        background.set(termId, run);
      }
      await run;
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
    },

    retry: async () => {
      if (get().termsState === "error") {
        set({ termsState: "loading", termsError: null });
        await loadTerms();
      }
      for (const [termId, t] of Object.entries(get().byTerm)) {
        if (t?.manifestState === "error") {
          patchTerm(termId, () => ({ manifestState: "loading" }));
          await get().ensureTerm(termId);
        }
      }
    },
  };
});

// Every published query's newer format (the manifest's, PlanetTerp's, the
// campus map's, calendars', the course index's) is the same signal, with
// the same Reload.
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
