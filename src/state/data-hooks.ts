import {
  type UseQueryResult,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  AcademicCalendar,
  BuildingCode,
  DeptCode,
  PlanetTerpDept,
  PlanetTerpSource,
  ReviewsDept,
  RouteGeometry,
  TermId,
  TravelMode,
} from "~/core/schema";
import type { CampusMap } from "~/core/travel";
import { relativeWords } from "~/core/words";
import { type LoadState, useCatalog } from "./catalog-store";
import {
  buildingsQuery,
  calendarQuery,
  campusFrom,
  geoManifestQuery,
  isNotPublished,
  planetTerpDeptQuery,
  planetTerpEntry,
  planetTerpManifestQuery,
  routeGeometryQuery,
  routesQuery,
} from "./query/catalog";
import { usePublishedSource } from "./query/published";
import { reviewsDeptQuery, reviewsManifestQuery } from "./query/review-numbers";

// Hooks for published data beyond the term catalog. Each one starts its own
// load (cached, validated, once per session) and re-renders when it lands.

/** A clock that ticks every `ms`, for relative times ("2 minutes ago"). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type SeatsFreshnessState =
  | "loading"
  | "live"
  | "offline"
  | "archived"
  | "unknown";

export interface SeatsFreshness {
  state: SeatsFreshnessState;
  /** Plain words to show above the section list; empty while loading. */
  text: string;
  /** Testudo's "Open Seats as of" time (or when we fetched, if Testudo didn't say). */
  asOf: string | null;
}

/**
 * "Seats as of 2 minutes ago" (SPEC §3.4), from Testudo's as-of time. Archived
 * terms say their seats stopped updating; when the server can't be reached,
 * "Offline · showing saved data". Never alarming.
 */
export function useSeatsFreshness(termId: TermId | null): SeatsFreshness {
  const now = useNow();
  const term = useCatalog((s) => s.terms?.find((t) => t.id === termId));
  const catalog = useCatalog((s) => (termId ? s.byTerm[termId] : undefined));
  const offline = useCatalog((s) => s.network === "offline");

  if (term?.status === "archived") {
    return {
      state: "archived",
      text: "Seats stopped updating when this term was archived.",
      asOf: catalog?.seats?.asOf ?? catalog?.manifest?.seats?.fetchedAt ?? null,
    };
  }
  if (!catalog?.manifest) return { state: "loading", text: "", asOf: null };
  const asOf = catalog.seats?.asOf ?? catalog.manifest.seats?.fetchedAt ?? null;
  if (offline && catalog.seats) {
    return { state: "offline", text: "Offline · showing saved data", asOf };
  }
  if (!catalog.seats || !asOf) {
    return { state: "unknown", text: "Seats unknown", asOf: null };
  }
  return {
    state: "live",
    text: `Seats as of ${relativeWords(asOf, now)}`,
    asOf,
  };
}

/**
 * Routes and off-campus codes for travel; `EMPTY_CAMPUS` until they load.
 * With `load` false it only reads what's already loaded (the scheduler
 * loads it once the plan has somewhere to walk between).
 */
export function useCampus(load = true): {
  campus: CampusMap;
  state: LoadState | "idle";
} {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery({ ...geoManifestQuery(source), enabled: load });
  const buildings = useQuery({
    ...buildingsQuery(source, manifest.data),
    enabled: load,
  });
  const routes = useQuery({
    ...routesQuery(source, manifest.data),
    enabled: load,
  });
  const campus = useMemo(
    () => campusFrom(buildings.data, routes.data),
    [buildings.data, routes.data],
  );
  const hasRoutes = Boolean(manifest.data?.routes);
  const state: LoadState | "idle" =
    buildings.data && (!hasRoutes || routes.data)
      ? "ready"
      : manifest.isError || buildings.isError || routes.isError
        ? "error"
        : load && source
          ? "loading"
          : "idle";
  return { campus, state };
}

/**
 * Loads the department a course is in ahead of the rest of the term, and its
 * PlanetTerp file beside it, so the course's details show as soon as those
 * two arrive rather than after the whole catalog (DATA.md §5.1).
 */
export function useCourseDept(termId: TermId | null, dept: DeptCode): void {
  const reader = useCatalog((s) => s.reader);
  const ensureDepts = useCatalog((s) => s.ensureDepts);
  useEffect(() => {
    if (!reader || !termId) return;
    void ensureDepts(termId, [dept]);
  }, [reader, termId, dept, ensureDepts]);
  useInstructors(dept);
}

/** PlanetTerp's manifest; `load` false only reads what's already loaded. */
function usePlanetTerpManifest(load: boolean) {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery({
    ...planetTerpManifestQuery(source),
    enabled: load,
  });
  return { source, manifest };
}

/**
 * A department's PlanetTerp file: instructors (by slug), the Testudo name →
 * slug join (`names`, keyed by `instructorNameKey`), and grades per course.
 * `source` says how current PlanetTerp is (null until its manifest loads);
 * `state: "error"` means the file didn't load, which isn't "no data".
 * `retry` asks again (the manifest if that's what failed).
 */
export function useInstructors(dept: DeptCode | null): {
  data: PlanetTerpDept | null;
  state: LoadState | "idle";
  source: PlanetTerpSource | null;
  retry: () => void;
} {
  const { source, manifest } = usePlanetTerpManifest(dept !== null);
  const entry = dept ? planetTerpEntry(manifest.data, dept) : undefined;
  // A file the server deleted asks for the manifest again before it fails
  // (`planetTerpDeptQuery`), so until then it's loading, never an error.
  const file = useQuery(planetTerpDeptQuery(source, entry));
  const state: LoadState | "idle" =
    !dept || !source
      ? "idle"
      : manifest.data === undefined
        ? manifest.isError
          ? "error"
          : "loading"
        : !entry || file.data
          ? "ready"
          : file.isError
            ? "error"
            : "loading";
  return {
    data: entry ? (file.data ?? null) : null,
    state,
    source: manifest.data?.source ?? null,
    retry: () =>
      void (manifest.data === undefined ? manifest.refetch() : file.refetch()),
  };
}

/**
 * Ratings by department, from whatever PlanetTerp files are already loaded
 * (a course's details loads its department's): sorting and ranking read
 * these, and never load more.
 */
export function useLoadedPlanetTerp(): ReadonlyMap<DeptCode, PlanetTerpDept> {
  const { source, manifest } = usePlanetTerpManifest(false);
  const departments = manifest.data?.departments ?? NO_DEPARTMENTS;
  // One observer per department (~200): built once per manifest, not per
  // render, and read as the loaded files alone, so a render where none
  // changed hands back the same array, and so the same Map.
  const queries = useMemo(
    () =>
      departments.map((d) => ({
        ...planetTerpDeptQuery(source, d),
        enabled: false,
      })),
    [source, departments],
  );
  const loaded = useQueries({ queries, combine: loadedFiles });
  return useMemo(
    () => new Map(loaded.map((file) => [file.dept, file] as const)),
    [loaded],
  );
}
const NO_DEPARTMENTS: readonly { code: DeptCode; hash: string }[] = [];
/** The files that have loaded; Query keeps the array's identity while they don't change. */
function loadedFiles(
  files: UseQueryResult<PlanetTerpDept>[],
): readonly PlanetTerpDept[] {
  return files.flatMap((f) => (f.data ? [f.data] : []));
}

/**
 * A department's Terpsicle review numbers (V2 §7.6), loaded on first use
 * through the query cache (./query/review-numbers.ts). Null while loading, when nothing is published for it, when the file
 * didn't load (PlanetTerp's numbers then stand alone), and whenever
 * `enabled` is false (`REVIEWS_ENABLED` off).
 */
export function useTerpsicleReviews(
  dept: DeptCode | null,
  enabled: boolean,
): ReviewsDept | null {
  const source = usePublishedSource((s) => s.source);
  const on = enabled && dept !== null;
  const manifest = useQuery({
    ...reviewsManifestQuery(source),
    enabled: on,
  });
  // A department the manifest doesn't list has no Terpsicle reviews yet.
  const entry = on
    ? manifest.data?.departments.find((d) => d.code === dept)
    : undefined;
  const file = useQuery(reviewsDeptQuery(source, entry));
  return entry ? (file.data ?? null) : null;
}

/**
 * How current PlanetTerp is, and whether this department's file failed to
 * load. Reads only: `useInstructors` does the loading.
 */
export function usePlanetTerpStatus(dept: DeptCode | null): {
  source: PlanetTerpSource | null;
  failed: boolean;
} {
  const { source, manifest } = usePlanetTerpManifest(false);
  const entry = dept ? planetTerpEntry(manifest.data, dept) : undefined;
  const file = useQuery({
    ...planetTerpDeptQuery(source, entry),
    enabled: false,
  });
  return {
    source: manifest.data?.source ?? null,
    failed:
      dept !== null &&
      file.data === undefined &&
      (file.isError || (manifest.data === undefined && manifest.isError)),
  };
}

/**
 * The term's academic calendar (.ics). `status: "not-published"`, and a
 * `ready` state with no calendar (no file for the term yet), both mean the
 * dates aren't out: say so plainly. `retry` asks again.
 */
export function useAcademicCalendar(termId: TermId | null): {
  calendar: AcademicCalendar | null;
  state: LoadState | "idle";
  retry: () => void;
} {
  const source = usePublishedSource((s) => s.source);
  const query = useQuery(calendarQuery(source, termId));
  const state: LoadState | "idle" =
    !termId || !source
      ? "idle"
      : query.data || isNotPublished(query.error)
        ? "ready"
        : query.isError
          ? "error"
          : "loading";
  return {
    calendar: query.data ?? null,
    state,
    retry: () => void query.refetch(),
  };
}

/** These terms' academic calendars, whichever have loaded (Now and Next). */
export function useAcademicCalendars(
  termIds: readonly TermId[],
): readonly AcademicCalendar[] {
  const source = usePublishedSource((s) => s.source);
  return useQueries({
    queries: termIds.map((id) => calendarQuery(source, id)),
    combine: combineCalendars,
  });
}
function combineCalendars(
  results: UseQueryResult<AcademicCalendar>[],
): readonly AcademicCalendar[] {
  return results.flatMap((r) => (r.data ? [r.data] : []));
}

/**
 * A connection's walking path, fetched when a map opens. `geometry` stays
 * null when there's no file: hide the map, never draw a straight line.
 */
export function useRouteGeometry(
  from: BuildingCode | null,
  to: BuildingCode | null,
  mode: TravelMode,
): { geometry: RouteGeometry | null; state: LoadState | "idle" } {
  const source = usePublishedSource((s) => s.source);
  const query = useQuery(routeGeometryQuery(source, from, to, mode));
  if (!from || !to) return { geometry: null, state: "idle" };
  if (query.data) return { geometry: query.data, state: "ready" };
  if (query.data === null || query.isError)
    return { geometry: null, state: "error" };
  return { geometry: null, state: "loading" };
}

/**
 * The seat poll (DATA.md §5.1 step 5): for an active term, revalidate the
 * manifest every 60 s while the page is visible, and right away when it
 * becomes visible again or the connection comes back. Archived terms don't
 * poll. When a newer data format was published, the next time the page
 * becomes visible it reloads (DATA.md §2.3).
 */
export function useCatalogPolling(termId: TermId | null, everyMs = 60_000) {
  const archived = useCatalog(
    (s) => s.terms?.find((t) => t.id === termId)?.status === "archived",
  );
  const reader = useCatalog((s) => s.reader);
  const refresh = useCatalog((s) => s.refreshTerm);
  useEffect(() => {
    if (!termId || !reader || archived) return;
    const visible = () => document.visibilityState === "visible";
    const poll = () => {
      if (visible()) void refresh(termId);
    };
    const onVisible = () => {
      if (!visible()) return;
      if (useCatalog.getState().appStale) {
        window.location.reload();
        return;
      }
      void refresh(termId);
    };
    const id = setInterval(poll, everyMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [termId, reader, archived, refresh, everyMs]);
}
