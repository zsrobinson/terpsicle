import { create } from "zustand";
import {
  COURSE_INDEX_MANIFEST_KEY,
  type CourseCode,
  type CourseIndexDept,
  CourseIndexDeptSchema,
  type CourseIndexEntry,
  type CourseIndexManifest,
  CourseIndexManifestSchema,
  CourseSearchFileSchema,
  type CourseSearchRow,
  courseIndexDeptKey,
  courseSearchKey,
  type DeptCode,
  SCHEMA_VERSIONS,
} from "~/core/schema";
import type { LoadState } from "./catalog-store";
import { type CacheFile, type DataCache, versionedCache } from "./data-cache";
import {
  DataError,
  type DataSource,
  readParsed,
  SchemaVersionError,
} from "./data-source";

// The course index (DATA.md §3.4, §5.2): every course in any term, for the
// four-year planner. Plan loads this module on demand; the scheduler never
// does (scripts/check-bundle.ts keeps it out of /schedule's eager bundle).
//
// The catalog store's flow (DATA.md §5.1) with one difference: department
// files load only when asked for, so a cached manifest may list files the
// browser doesn't have yet. What is cached is always listed by the cached
// manifest. Mock mode is the same code over the fixtures' mock bucket; the
// caller's cache carries the `mock:` prefix.
//
//   useCourseIndex.getState().connect(source, { cache });
//   await useCourseIndex.getState().ensureSearch();

export interface CourseIndexState {
  source: DataSource | null;
  cache: DataCache | null;
  manifest: CourseIndexManifest | null;
  manifestState: LoadState | "idle";
  /** Where the manifest came from: the browser's cache, or the server this session. */
  manifestSource: "cache" | "network" | null;
  /** Every course, sorted by code; null until the search file loads. */
  search: readonly CourseSearchRow[] | null;
  searchState: LoadState | "idle";
  depts: Readonly<Partial<Record<DeptCode, CourseIndexDept>>>;
  deptsState: Readonly<Partial<Record<DeptCode, LoadState>>>;
  /** The server publishes a newer index format than this tab reads: reload when next shown. */
  appStale: boolean;

  connect: (source: DataSource, options?: { cache?: DataCache | null }) => void;
  /** Loads the search file (codes, titles, credits, GenEd codes). */
  ensureSearch: () => Promise<void>;
  /** Loads these departments' files (the full entries). Unknown departments are ready and empty. */
  ensureDepts: (depts: readonly DeptCode[]) => Promise<void>;
  /** Revalidates the manifest and refetches only the loaded files that changed. */
  refresh: () => Promise<void>;
}

export const INITIAL_COURSE_INDEX_STATE = {
  source: null,
  cache: null,
  manifest: null,
  manifestState: "idle",
  manifestSource: null,
  search: null,
  searchState: "idle",
  depts: {},
  deptsState: {},
  appStale: false,
} satisfies Partial<CourseIndexState>;

/**
 * A course's entry: `undefined` while its department hasn't loaded, `null`
 * when the index doesn't have it (an unknown code).
 */
export function courseIndexEntry(
  state: Pick<CourseIndexState, "depts" | "deptsState">,
  code: CourseCode,
): CourseIndexEntry | null | undefined {
  const dept = code.slice(0, 4);
  if (state.deptsState[dept] !== "ready") return undefined;
  return state.depts[dept]?.courses.find((c) => c.code === code) ?? null;
}

const FAMILY = "courses" as const;
const file = (key: string, data: unknown): CacheFile => ({
  key,
  family: FAMILY,
  termId: null,
  data,
});

const isNewer = (error: unknown): boolean =>
  error instanceof SchemaVersionError && error.newer;
const isMissing = (error: unknown): boolean =>
  error instanceof DataError && error.reason === "missing";

export const useCourseIndex = create<CourseIndexState>()((set, get) => {
  const inFlight = new Map<string, Promise<void>>();
  const once = (key: string, run: () => Promise<void>): Promise<void> => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const promise = run().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  };
  /** The one network check of the manifest this session. */
  let revalidated: Promise<void> | null = null;
  const writes = new Set<Promise<void>>();

  const noteNewer = (error: unknown) => {
    if (isNewer(error)) set({ appStale: true });
  };

  /** A hashed file: the cache if it has it, else the network, then cached in the background. */
  const hashed = async <T>(
    key: string,
    fetch: () => Promise<T>,
  ): Promise<T> => {
    const { cache } = get();
    const hit = cache ? (await cache.getFiles([key])).get(key) : undefined;
    if (hit !== undefined) return hit as T;
    const data = await fetch();
    if (cache) {
      const write = cache
        .putFiles([file(key, data)])
        .finally(() => writes.delete(write));
      writes.add(write);
    }
    return data;
  };

  const loadSearch = async (manifest: CourseIndexManifest) => {
    const { source } = get();
    if (!source) return;
    const key = courseSearchKey(manifest.search.hash);
    const search = await hashed(key, () =>
      readParsed(source, key, CourseSearchFileSchema, FAMILY),
    );
    set({ search: search.courses, searchState: "ready" });
  };

  const loadDept = async (manifest: CourseIndexManifest, dept: DeptCode) => {
    const { source } = get();
    const entry = manifest.departments.find((d) => d.code === dept);
    if (!source) return;
    if (!entry) {
      // Not in the index: no course of that department has been seen.
      const depts = { ...get().depts };
      delete depts[dept];
      set({ depts, deptsState: { ...get().deptsState, [dept]: "ready" } });
      return;
    }
    const key = courseIndexDeptKey(dept, entry.hash);
    const data = await hashed(key, () =>
      readParsed(source, key, CourseIndexDeptSchema, FAMILY),
    );
    set({
      depts: { ...get().depts, [dept]: data },
      deptsState: { ...get().deptsState, [dept]: "ready" },
    });
  };

  /**
   * Stores the manifest once the files loaded under it are cached, and drops
   * cached index files it no longer lists, in one transaction.
   */
  const persist = async (manifest: CourseIndexManifest, checkedAt: string) => {
    const { cache } = get();
    if (!cache) return;
    await Promise.all(writes);
    await cache.commit(
      { key: COURSE_INDEX_MANIFEST_KEY, data: manifest, checkedAt },
      [],
      {
        termId: null,
        family: FAMILY,
        keep: new Set([
          courseSearchKey(manifest.search.hash),
          ...manifest.departments.map((d) =>
            courseIndexDeptKey(d.code, d.hash),
          ),
        ]),
      },
    );
  };

  const refresh = () =>
    once("refresh", async () => {
      const { source } = get();
      if (!source) return;
      let next: CourseIndexManifest;
      try {
        next = await readParsed(
          source,
          COURSE_INDEX_MANIFEST_KEY,
          CourseIndexManifestSchema,
          FAMILY,
        );
      } catch (error) {
        // Offline or a format this build doesn't read: keep what's loaded.
        console.error(error);
        noteNewer(error);
        if (!get().manifest) set({ manifestState: "error" });
        return;
      }
      const old = get().manifest;
      const oldHash = new Map(
        (old?.departments ?? []).map((d) => [d.code, d.hash]),
      );
      const nextHash = new Map(next.departments.map((d) => [d.code, d.hash]));
      const { deptsState, searchState } = get();
      const loaded = (Object.keys(deptsState) as DeptCode[]).filter(
        (d) => deptsState[d] === "ready",
      );
      const changed = loaded.filter((d) => oldHash.get(d) !== nextHash.get(d));
      set({
        manifest: next,
        manifestState: "ready",
        manifestSource: "network",
      });
      const reloads: Promise<void>[] = changed.map((d) =>
        loadDept(next, d).catch((error: unknown) => console.error(error)),
      );
      if (searchState === "ready" && old?.search.hash !== next.search.hash)
        reloads.push(
          loadSearch(next).catch((error: unknown) => console.error(error)),
        );
      await Promise.all(reloads);
      await persist(next, new Date().toISOString());
    });

  /** The cached manifest at once, revalidated once per session; else the network. */
  const loadManifest = () =>
    once("manifest", async () => {
      if (get().manifest) return;
      set({ manifestState: "loading" });
      const hit = await get().cache?.getPointer(COURSE_INDEX_MANIFEST_KEY);
      const cached = hit ? CourseIndexManifestSchema.safeParse(hit.data) : null;
      if (cached?.success) {
        set({
          manifest: cached.data,
          manifestState: "ready",
          manifestSource: "cache",
        });
        revalidated ??= refresh();
        return;
      }
      // Nothing saved: wait for the server (again, if an earlier try failed).
      revalidated = refresh();
      await revalidated;
    });

  /**
   * Loads a file for the current manifest. A cached manifest can be older
   * than the server keeps its files (a day), so a missing file waits for
   * this session's revalidation and tries again with the new hash.
   */
  const withManifest = async (
    load: (manifest: CourseIndexManifest) => Promise<void>,
  ) => {
    await loadManifest();
    const manifest = get().manifest;
    if (!manifest) return false;
    try {
      await load(manifest);
    } catch (error) {
      const retry = get().manifestSource === "cache" && isMissing(error);
      if (!retry) throw error;
      await revalidated;
      const fresh = get().manifest;
      if (!fresh || fresh === manifest) throw error;
      await load(fresh);
    }
    return true;
  };

  return {
    ...INITIAL_COURSE_INDEX_STATE,

    connect: (source, options = {}) => {
      inFlight.clear();
      revalidated = null;
      const cache = options.cache
        ? versionedCache(options.cache, SCHEMA_VERSIONS)
        : null;
      set({ ...INITIAL_COURSE_INDEX_STATE, source, cache });
    },

    ensureSearch: () =>
      once("search", async () => {
        if (get().searchState === "ready") return;
        set({ searchState: "loading" });
        try {
          if (!(await withManifest(loadSearch))) set({ searchState: "error" });
        } catch (error) {
          console.error(error);
          noteNewer(error);
          set({ searchState: get().search ? "ready" : "error" });
        }
      }),

    ensureDepts: async (depts) => {
      const wanted = [...new Set(depts)].filter((d) => {
        const state = get().deptsState[d];
        return state !== "ready" && state !== "loading";
      });
      if (wanted.length > 0) {
        const deptsState = { ...get().deptsState };
        for (const d of wanted) deptsState[d] = "loading";
        set({ deptsState });
      }
      await Promise.all(
        [...new Set(depts)].map((dept) =>
          once(`dept:${dept}`, async () => {
            if (get().deptsState[dept] === "ready") return;
            try {
              const loaded = await withManifest((m) => loadDept(m, dept));
              if (!loaded)
                set({ deptsState: { ...get().deptsState, [dept]: "error" } });
            } catch (error) {
              console.error(error);
              noteNewer(error);
              set({
                deptsState: {
                  ...get().deptsState,
                  [dept]: get().depts[dept] ? "ready" : "error",
                },
              });
            }
          }),
        ),
      );
    },

    refresh,
  };
});
