import { create } from "zustand";
import {
  type DeptCode,
  type InstructorId,
  instructorNameKey,
  type PlanetTerpDept,
  REVIEWS_MANIFEST_KEY,
  type ReviewsDept,
  ReviewsDeptSchema,
  type ReviewsManifest,
  ReviewsManifestSchema,
  reviewsDeptKey,
  SCHEMA_VERSIONS,
  type TerpsicleRating,
} from "~/core/schema";
import type { LoadState } from "./catalog-store";
import { type CacheFile, type DataCache, versionedCache } from "./data-cache";
import {
  DataError,
  type DataSource,
  readParsed,
  SchemaVersionError,
} from "./data-source";

// Terpsicle reviews' numbers (R2 family `reviews/`, V2 §7.6, DATA.md §5.4),
// for the scheduler's course details and the reviews pages. Department files
// load only when asked for, like the course index (DATA.md §5.2): the cached
// manifest shows at once and is checked with the server once per session,
// and a file is read from the cache by hash, else fetched, validated and
// cached. Mock mode is the same code over the fixtures' mock bucket.
//
//   useReviewNumbers.getState().connect(source, { cache });
//   await useReviewNumbers.getState().ensureDepts(["CMSC"]);

export interface ReviewNumbersState {
  source: DataSource | null;
  cache: DataCache | null;
  manifest: ReviewsManifest | null;
  manifestSource: "cache" | "network" | null;
  depts: Readonly<Partial<Record<DeptCode, ReviewsDept>>>;
  deptsState: Readonly<Partial<Record<DeptCode, LoadState>>>;
  /** The server publishes a newer format than this tab reads: reload when next shown. */
  appStale: boolean;

  connect: (source: DataSource, options?: { cache?: DataCache | null }) => void;
  /** Loads these departments' files. A department the manifest doesn't list is ready and empty. */
  ensureDepts: (depts: readonly DeptCode[]) => Promise<void>;
  /** Revalidates the manifest and refetches only the loaded files that changed. */
  refresh: () => Promise<void>;
}

export const INITIAL_REVIEW_NUMBERS_STATE = {
  source: null,
  cache: null,
  manifest: null,
  manifestSource: null,
  depts: {},
  deptsState: {},
  appStale: false,
} satisfies Partial<ReviewNumbersState>;

/**
 * The instructor a Testudo name means, and their Terpsicle numbers. A name
 * here that points at a PlanetTerp slug is the owner's fix and wins; a
 * minted instructor's name yields to PlanetTerp's own join.
 */
export function terpsicleInstructor(
  reviews: ReviewsDept | null,
  planetTerp: PlanetTerpDept | null,
  name: string,
): { id: InstructorId; numbers: TerpsicleRating | null } | null {
  const key = instructorNameKey(name);
  const ours = reviews?.names[key];
  const theirs = planetTerp?.names[key];
  const id =
    ours && (!ours.startsWith("t~") || !theirs) ? ours : (theirs ?? ours);
  if (!id) return null;
  return { id, numbers: reviews?.instructors[id] ?? null };
}

const FAMILY = "reviews" as const;
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

export const useReviewNumbers = create<ReviewNumbersState>()((set, get) => {
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

  const loadDept = async (manifest: ReviewsManifest, dept: DeptCode) => {
    const { source, cache } = get();
    if (!source) return;
    const entry = manifest.departments.find((d) => d.code === dept);
    if (!entry) {
      // Nothing published for it: no Terpsicle review of its courses yet.
      const depts = { ...get().depts };
      delete depts[dept];
      set({ depts, deptsState: { ...get().deptsState, [dept]: "ready" } });
      return;
    }
    const key = reviewsDeptKey(dept, entry.hash);
    const hit = cache ? (await cache.getFiles([key])).get(key) : undefined;
    let data = hit as ReviewsDept | undefined;
    if (data === undefined) {
      const fetched = await readParsed(source, key, ReviewsDeptSchema, FAMILY);
      data = fetched;
      if (cache) {
        const write = cache
          .putFiles([file(key, fetched)])
          .finally(() => writes.delete(write));
        writes.add(write);
      }
    }
    set({
      depts: { ...get().depts, [dept]: data },
      deptsState: { ...get().deptsState, [dept]: "ready" },
    });
  };

  /** Stores the manifest once its loaded files are cached, and drops files it no longer lists. */
  const persist = async (manifest: ReviewsManifest, checkedAt: string) => {
    const { cache } = get();
    if (!cache) return;
    await Promise.all(writes);
    await cache.commit(
      { key: REVIEWS_MANIFEST_KEY, data: manifest, checkedAt },
      [],
      {
        termId: null,
        family: FAMILY,
        keep: new Set(
          manifest.departments.map((d) => reviewsDeptKey(d.code, d.hash)),
        ),
      },
    );
  };

  const refresh = () =>
    once("refresh", async () => {
      const { source } = get();
      if (!source) return;
      let next: ReviewsManifest;
      try {
        next = await readParsed(
          source,
          REVIEWS_MANIFEST_KEY,
          ReviewsManifestSchema,
          FAMILY,
        );
      } catch (error) {
        // Offline, not published yet, or a newer format: PlanetTerp's
        // numbers still show on their own.
        console.error(error);
        if (isNewer(error)) set({ appStale: true });
        return;
      }
      const old = new Map(
        (get().manifest?.departments ?? []).map((d) => [d.code, d.hash]),
      );
      const now = new Map(next.departments.map((d) => [d.code, d.hash]));
      const { deptsState } = get();
      const changed = (Object.keys(deptsState) as DeptCode[]).filter(
        (d) => deptsState[d] === "ready" && old.get(d) !== now.get(d),
      );
      set({ manifest: next, manifestSource: "network" });
      await Promise.all(
        changed.map((d) =>
          loadDept(next, d).catch((error: unknown) => console.error(error)),
        ),
      );
      await persist(next, new Date().toISOString());
    });

  /** The cached manifest at once, revalidated once per session; else the network. */
  const loadManifest = () =>
    once("manifest", async () => {
      if (get().manifest) return;
      const hit = await get().cache?.getPointer(REVIEWS_MANIFEST_KEY);
      const cached = hit ? ReviewsManifestSchema.safeParse(hit.data) : null;
      if (cached?.success) {
        set({ manifest: cached.data, manifestSource: "cache" });
        revalidated ??= refresh();
        return;
      }
      revalidated = refresh();
      await revalidated;
    });

  /**
   * A cached manifest can be older than the server keeps files (a day), so a
   * missing file waits for this session's check and tries the new hash.
   */
  const withManifest = async (
    load: (manifest: ReviewsManifest) => Promise<void>,
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
    ...INITIAL_REVIEW_NUMBERS_STATE,

    connect: (source, options = {}) => {
      inFlight.clear();
      revalidated = null;
      const cache = options.cache
        ? versionedCache(options.cache, SCHEMA_VERSIONS)
        : null;
      set({ ...INITIAL_REVIEW_NUMBERS_STATE, source, cache });
    },

    ensureDepts: async (depts) => {
      const unique = [...new Set(depts)];
      const wanted = unique.filter((d) => {
        const state = get().deptsState[d];
        return state !== "ready" && state !== "loading";
      });
      if (wanted.length > 0) {
        const deptsState = { ...get().deptsState };
        for (const d of wanted) deptsState[d] = "loading";
        set({ deptsState });
      }
      await Promise.all(
        unique.map((dept) =>
          once(`dept:${dept}`, async () => {
            if (get().deptsState[dept] === "ready") return;
            try {
              const loaded = await withManifest((m) => loadDept(m, dept));
              if (!loaded)
                set({ deptsState: { ...get().deptsState, [dept]: "error" } });
            } catch (error) {
              console.error(error);
              if (isNewer(error)) set({ appStale: true });
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
