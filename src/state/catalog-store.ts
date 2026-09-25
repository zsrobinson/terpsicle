import { create } from "zustand";
import type {
  Course,
  CourseCode,
  DeptCode,
  Manifest,
  SeatsFile,
  Term,
  TermId,
} from "~/core/schema";
import type { DataReader } from "./data-source";

// Published catalog data, loaded on demand through the data source: the term
// list, and per term its manifest, seats and whichever departments are needed.
// M6 adds the IndexedDB cache and polling behind the same actions.

export type LoadState = "loading" | "ready" | "error";

export interface TermCatalog {
  manifest: Manifest | null;
  manifestState: LoadState;
  depts: Readonly<Partial<Record<DeptCode, LoadState>>>;
  courses: Readonly<Partial<Record<CourseCode, Course>>>;
  seats: SeatsFile | null;
}

export interface CatalogState {
  reader: DataReader | null;
  terms: readonly Term[] | null;
  termsState: LoadState | "idle";
  /** Specific, plain words for the person, when terms can't load. */
  termsError: string | null;
  byTerm: Readonly<Partial<Record<TermId, TermCatalog>>>;

  setReader: (reader: DataReader) => void;
  loadTerms: () => Promise<void>;
  /** Loads the term's manifest and seats, then the given departments. */
  ensureDepts: (termId: TermId, depts: readonly DeptCode[]) => Promise<void>;
}

const EMPTY_TERM: TermCatalog = {
  manifest: null,
  manifestState: "loading",
  depts: {},
  courses: {},
  seats: null,
};

const inFlight = new Map<string, Promise<void>>();
function once(key: string, run: () => Promise<void>): Promise<void> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export const INITIAL_CATALOG_STATE = {
  reader: null,
  terms: null,
  termsState: "idle",
  termsError: null,
  byTerm: {},
} satisfies Partial<CatalogState>;

export const useCatalog = create<CatalogState>()((set, get) => {
  const patchTerm = (
    termId: TermId,
    patch: (t: TermCatalog) => Partial<TermCatalog>,
  ) => {
    const current = get().byTerm[termId] ?? EMPTY_TERM;
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
        if (manifest.seats) {
          const seats = await reader.seats(termId, manifest.seats.hash);
          patchTerm(termId, () => ({ seats }));
        }
      } catch (error) {
        console.error(error);
        patchTerm(termId, () => ({ manifestState: "error" }));
      }
    });

  return {
    ...INITIAL_CATALOG_STATE,

    setReader: (reader) => {
      inFlight.clear();
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

    ensureDepts: async (termId, depts) => {
      const { reader } = get();
      if (!reader) return;
      if (get().byTerm[termId]?.manifestState !== "ready")
        await loadManifest(reader, termId);
      const manifest = get().byTerm[termId]?.manifest;
      if (!manifest) return;
      await Promise.all(
        [...new Set(depts)].map((dept) => {
          const entry = manifest.departments.find((d) => d.code === dept);
          const state = get().byTerm[termId]?.depts[dept];
          if (!entry || state === "ready") return Promise.resolve();
          return once(`dept:${termId}:${dept}`, async () => {
            patchTerm(termId, (t) => ({
              depts: { ...t.depts, [dept]: "loading" },
            }));
            try {
              const chunk = await reader.deptChunk(termId, dept, entry.hash);
              patchTerm(termId, (t) => {
                const courses = { ...t.courses };
                for (const c of chunk.courses) courses[c.code] = c;
                return { courses, depts: { ...t.depts, [dept]: "ready" } };
              });
            } catch (error) {
              console.error(error);
              patchTerm(termId, (t) => ({
                depts: { ...t.depts, [dept]: "error" },
              }));
            }
          });
        }),
      );
    },
  };
});

/** Department of a course code (DATA.md §1). */
export const deptOf = (code: CourseCode): DeptCode => code.slice(0, 4);
