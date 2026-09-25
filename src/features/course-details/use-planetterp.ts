import { useEffect } from "react";
import { create } from "zustand";
import {
  type DeptCode,
  type Instructor,
  type InstructorSlug,
  instructorNameKey,
  type PlanetTerpDept,
  type PlanetTerpManifest,
} from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";

// PlanetTerp data for course details: one small file per department, loaded
// the first time a course from it opens (DATA §5.1). Reads go through the
// data seam; when M6's `useInstructors(dept)` lands, this file is the one to
// swap.

type LoadState = "loading" | "ready" | "missing" | "error";

interface PlanetTerpState {
  manifest: Promise<PlanetTerpManifest | null> | null;
  depts: Readonly<
    Partial<Record<DeptCode, { state: LoadState; data: PlanetTerpDept | null }>>
  >;
  ensure: (dept: DeptCode) => Promise<void>;
}

export const usePlanetTerpStore = create<PlanetTerpState>()((set, get) => ({
  manifest: null,
  depts: {},
  ensure: async (dept) => {
    const reader = useCatalog.getState().reader;
    if (!reader || get().depts[dept]) return;
    const put = (state: LoadState, data: PlanetTerpDept | null = null) =>
      set({ depts: { ...get().depts, [dept]: { state, data } } });
    put("loading");
    let manifest = get().manifest;
    if (!manifest) {
      manifest = reader.planetTerpManifest().catch((error: unknown) => {
        console.error(error);
        return null;
      });
      set({ manifest });
    }
    const entry = (await manifest)?.departments.find((d) => d.code === dept);
    if (!entry) {
      put("missing");
      return;
    }
    try {
      put("ready", await reader.planetTerpDept(dept, entry.hash));
    } catch (error) {
      console.error(error);
      put("error");
    }
  },
}));

export interface DeptPlanetTerp {
  state: LoadState;
  data: PlanetTerpDept | null;
}

const LOADING: DeptPlanetTerp = { state: "loading", data: null };

/** A department's PlanetTerp file, loading it on first use. */
export function usePlanetTerpDept(dept: DeptCode): DeptPlanetTerp {
  const reader = useCatalog((s) => s.reader);
  const entry = usePlanetTerpStore((s) => s.depts[dept]);
  useEffect(() => {
    if (reader) void usePlanetTerpStore.getState().ensure(dept);
  }, [dept, reader]);
  return entry ?? LOADING;
}

/** The PlanetTerp instructor a Testudo name was joined to, if any. */
export function instructorFor(
  data: PlanetTerpDept | null,
  name: string,
): Instructor | null {
  if (!data) return null;
  const slug: InstructorSlug | undefined = data.names[instructorNameKey(name)];
  return slug ? (data.instructors[slug] ?? null) : null;
}
