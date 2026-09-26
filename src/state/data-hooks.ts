import { useEffect, useState } from "react";
import type {
  AcademicCalendar,
  BuildingCode,
  DeptCode,
  PlanetTerpDept,
  PlanetTerpSource,
  RouteGeometry,
  TermId,
  TravelMode,
} from "~/core/schema";
import { formatRelative } from "~/core/time";
import type { CampusMap } from "~/core/travel";
import { type LoadState, useCatalog } from "./catalog-store";

// Hooks for published data beyond the term catalog. Each one starts its own
// load (cached, validated, once per session) and re-renders when it lands.

/** A clock that ticks every `ms`, for relative times ("2 min ago"). */
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
 * "Seats as of 2 min ago" (SPEC §3.4), from Testudo's as-of time. Archived
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
    text: `Seats as of ${formatRelative(asOf, now)}`,
    asOf,
  };
}

/** Routes and off-campus codes for travel; `EMPTY_CAMPUS` until they load. */
export function useCampus(): { campus: CampusMap; state: LoadState | "idle" } {
  const campus = useCatalog((s) => s.campus);
  const state = useCatalog((s) => s.campusState);
  const reader = useCatalog((s) => s.reader);
  const ensureCampus = useCatalog((s) => s.ensureCampus);
  useEffect(() => {
    if (reader) void ensureCampus();
  }, [reader, ensureCampus]);
  return { campus, state };
}

/**
 * A department's PlanetTerp file: instructors (by slug), the Testudo name →
 * slug join (`names`, keyed by `instructorNameKey`), and grades per course.
 * `source` says how current PlanetTerp is (null until its manifest loads);
 * `state: "error"` means the file didn't load, which isn't "no data".
 */
export function useInstructors(dept: DeptCode | null): {
  data: PlanetTerpDept | null;
  state: LoadState | "idle";
  source: PlanetTerpSource | null;
} {
  const data = useCatalog((s) => (dept ? (s.instructors[dept] ?? null) : null));
  const state = useCatalog((s) =>
    dept ? (s.instructorsState[dept] ?? "idle") : "idle",
  );
  const source = useCatalog((s) => s.planetTerpSource);
  const reader = useCatalog((s) => s.reader);
  const ensure = useCatalog((s) => s.ensureInstructors);
  useEffect(() => {
    if (reader && dept) void ensure(dept);
  }, [reader, dept, ensure]);
  return { data, state, source };
}

/**
 * How current PlanetTerp is, and whether this department's file failed to
 * load. Reads only: `useInstructors` does the loading.
 */
export function usePlanetTerpStatus(dept: DeptCode | null): {
  source: PlanetTerpSource | null;
  failed: boolean;
} {
  const source = useCatalog((s) => s.planetTerpSource);
  const failed = useCatalog((s) =>
    dept ? s.instructorsState[dept] === "error" : false,
  );
  return { source, failed };
}

/**
 * The term's academic calendar (.ics). `status: "not-published"`, and a
 * `ready` state with no calendar (no file for the term yet), both mean the
 * dates aren't out: say so plainly.
 */
export function useAcademicCalendar(termId: TermId | null): {
  calendar: AcademicCalendar | null;
  state: LoadState | "idle";
} {
  const calendar = useCatalog((s) =>
    termId ? (s.calendars[termId] ?? null) : null,
  );
  const state = useCatalog((s) =>
    termId ? (s.calendarsState[termId] ?? "idle") : "idle",
  );
  const reader = useCatalog((s) => s.reader);
  const ensure = useCatalog((s) => s.ensureCalendar);
  useEffect(() => {
    if (reader && termId) void ensure(termId);
  }, [reader, termId, ensure]);
  return { calendar, state };
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
  const load = useCatalog((s) => s.loadRouteGeometry);
  const reader = useCatalog((s) => s.reader);
  const [result, setResult] = useState<{
    key: string;
    geometry: RouteGeometry | null;
    state: LoadState;
  } | null>(null);
  const key = from && to ? `${from}-${to}-${mode}` : "";
  useEffect(() => {
    if (!from || !to || !reader) return;
    let cancelled = false;
    setResult({ key, geometry: null, state: "loading" });
    void load(from, to, mode).then((geometry) => {
      if (!cancelled)
        setResult({ key, geometry, state: geometry ? "ready" : "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, mode, reader, load]);
  if (!key) return { geometry: null, state: "idle" };
  if (result?.key !== key) return { geometry: null, state: "loading" };
  return { geometry: result.geometry, state: result.state };
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
