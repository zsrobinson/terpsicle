import { create } from "zustand";
import { buildCatalogIndex, type CatalogIndex } from "~/core/catalog";
import type {
  ChangesFile,
  Course,
  CourseCode,
  DeptCode,
  Manifest,
  SeatsFile,
  Term,
  TermId,
} from "~/core/schema";
import {
  type CampusMap,
  campusMap,
  decodeRoutes,
  EMPTY_CAMPUS,
} from "~/core/travel";
import type { DataReader } from "./data-source";

// Published data, loaded on demand through the data source: the term list;
// per term its manifest, seats, changes and departments (as a core
// CatalogIndex); and the campus map for travel. M6 adds the IndexedDB cache
// and polling behind the same actions.

export type LoadState = "loading" | "ready" | "error";

export interface TermCatalog {
  manifest: Manifest | null;
  manifestState: LoadState;
  depts: Readonly<Partial<Record<DeptCode, LoadState>>>;
  /** Every loaded course. Rebuilt (a new object) whenever departments load. */
  index: CatalogIndex;
  /** Every department in the manifest has loaded. */
  complete: boolean;
  seats: SeatsFile | null;
  changes: ChangesFile | null;
}

export interface CatalogState {
  reader: DataReader | null;
  terms: readonly Term[] | null;
  termsState: LoadState | "idle";
  /** Specific, plain words for the person, when terms can't load. */
  termsError: string | null;
  byTerm: Readonly<Partial<Record<TermId, TermCatalog>>>;
  /** Routes and off-campus codes; `EMPTY_CAMPUS` until the geo files load. */
  campus: CampusMap;
  campusState: LoadState | "idle";

  setReader: (reader: DataReader) => void;
  loadTerms: () => Promise<void>;
  /** Loads the term's manifest, seats and changes, then the given departments. */
  ensureDepts: (termId: TermId, depts: readonly DeptCode[]) => Promise<void>;
  /** Loads every department of the term (search, fit and problems need them all). */
  ensureTerm: (termId: TermId) => Promise<void>;
  /** Loads the buildings and routes files (DATA §4.2), once. */
  ensureCampus: () => Promise<void>;
}

/** DATA.md §5.1: fetch departments six at a time. */
const CONCURRENCY = 6;

function emptyTerm(termId: TermId): TermCatalog {
  return {
    manifest: null,
    manifestState: "loading",
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
  terms: null,
  termsState: "idle",
  termsError: null,
  byTerm: {},
  campus: EMPTY_CAMPUS,
  campusState: "idle",
} satisfies Partial<CatalogState>;

/** Loaded department chunks, per term, to rebuild the index from. */
const chunks = new Map<TermId, Map<DeptCode, readonly Course[]>>();

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

  const loadManifest = (reader: DataReader, termId: TermId) =>
    once(`manifest:${termId}`, async () => {
      patchTerm(termId, () => ({ manifestState: "loading" }));
      try {
        const manifest = await reader.manifest(termId);
        patchTerm(termId, () => ({ manifest, manifestState: "ready" }));
        const [seats, changes] = await Promise.all([
          manifest.seats ? reader.seats(termId, manifest.seats.hash) : null,
          manifest.changes
            ? reader.changes(termId, manifest.changes.hash)
            : null,
        ]);
        patchTerm(termId, () => ({ seats, changes }));
      } catch (error) {
        console.error(error);
        patchTerm(termId, () => ({ manifestState: "error" }));
      }
    });

  const ensureDepts = async (termId: TermId, depts: readonly DeptCode[]) => {
    const { reader } = get();
    if (!reader) return;
    if (get().byTerm[termId]?.manifestState !== "ready")
      await loadManifest(reader, termId);
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
    await eachLimited(wanted, CONCURRENCY, (entry) =>
      once(`dept:${termId}:${entry.code}`, async () => {
        try {
          const chunk = await reader.deptChunk(termId, entry.code, entry.hash);
          loaded.set(entry.code, chunk.courses);
          results[entry.code] = "ready";
        } catch (error) {
          console.error(error);
          results[entry.code] = "error";
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

  return {
    ...INITIAL_CATALOG_STATE,

    setReader: (reader) => {
      inFlight.clear();
      chunks.clear();
      set({ ...INITIAL_CATALOG_STATE, reader });
    },

    loadTerms: () =>
      once("terms", async () => {
        const { reader } = get();
        if (!reader) return;
        set({ termsState: "loading", termsError: null });
        try {
          const file = await reader.terms();
          set({ terms: file.terms, termsState: "ready" });
        } catch (error) {
          console.error(error);
          set({
            termsState: "error",
            termsError:
              "Couldn't load the list of terms. Check your connection and reload.",
          });
        }
      }),

    ensureDepts,

    ensureTerm: async (termId) => {
      const { reader } = get();
      if (!reader) return;
      if (get().byTerm[termId]?.manifestState !== "ready")
        await loadManifest(reader, termId);
      const manifest = get().byTerm[termId]?.manifest;
      if (manifest)
        await ensureDepts(
          termId,
          manifest.departments.map((d) => d.code),
        );
    },

    ensureCampus: () =>
      once("campus", async () => {
        const { reader, campusState } = get();
        if (!reader || campusState === "ready") return;
        set({ campusState: "loading" });
        try {
          const manifest = await reader.geoManifest();
          const [buildings, routes] = await Promise.all([
            reader.buildings(manifest.buildings.hash),
            manifest.routes ? reader.routes(manifest.routes.hash) : null,
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
  };
});

/** Department of a course code (DATA.md §1). */
export const deptOf = (code: CourseCode): DeptCode => code.slice(0, 4);
