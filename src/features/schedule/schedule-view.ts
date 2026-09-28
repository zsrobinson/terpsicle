import {
  type AnyRoute,
  type AnyRouter,
  type ParsedLocation,
  useRouter,
} from "@tanstack/react-router";
import { useMemo, useSyncExternalStore } from "react";
import {
  CONNECTION_PATH,
  COURSE_PATH,
  RESULT_PATH,
  TAB_PATHS,
} from "~/core/routing/schedule-location";
import { CourseCodeSchema, type RailTab } from "~/core/schema/primitives";
import {
  ConnectionIdSchema,
  DrillSearchSchema,
  ResultIdSchema,
  ScheduleHistoryStateSchema,
} from "~/core/schema/schedule-url";
import type { DrillEntry } from "~/state/drill";
import { optionLabel, useGenerateRun } from "~/state/generate-run-store";
import { useUi } from "~/state/ui-store";
import { tabById } from "./tabs";

// Where the scheduler is, read from the router: each rail tab and each
// drill-in is a route (src/routes/schedule.*.tsx), so the URL is the one
// source of "which tab, which view". src/features/schedule/README.md, "URL state".

/** The sidebar's place: a rail tab, and the view drilled into over it. */
export interface ScheduleView {
  tab: RailTab;
  drill: DrillEntry | null;
}

const TAB_BY_PATH = new Map<string, RailTab>(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab as RailTab]),
);

/** A path param as the URL spells it, decoded once. */
function decoded(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The route a location matches, by id, and its raw path params. */
export function routeAt(
  router: AnyRouter,
  pathname: string,
): { id: string | undefined; params: Record<string, string> } {
  const [, params, route] = router.getMatchedRoutes(pathname) as [
    unknown,
    Record<string, string>,
    AnyRoute | undefined,
  ];
  return { id: route?.id, params };
}

/**
 * The view a scheduler URL shows, or null for one that names none (plain
 * `/schedule`, which opens the saved view) or isn't the scheduler's. A
 * drill-in's path param that isn't valid names no drill-in.
 */
export function viewAt(
  router: AnyRouter,
  location: Pick<ParsedLocation, "pathname" | "search" | "state">,
): ScheduleView | null {
  const { id, params } = routeAt(router, location.pathname);
  if (!id) return null;
  const tabRoute = TAB_BY_PATH.get(id);
  if (tabRoute) return { tab: tabRoute, drill: null };
  const over = DrillSearchSchema.parse(location.search).tab;
  if (id === COURSE_PATH) {
    const code = CourseCodeSchema.safeParse(
      decoded(params.code)?.toUpperCase(),
    );
    const { detailsTab } = ScheduleHistoryStateSchema.parse(location.state);
    return {
      tab: over ?? "courses",
      drill: code.success
        ? {
            kind: "course",
            courseCode: code.data,
            ...(detailsTab ? { tab: detailsTab } : {}),
          }
        : null,
    };
  }
  if (id === CONNECTION_PATH) {
    const connectionId = ConnectionIdSchema.safeParse(
      decoded(params.connectionId),
    );
    return {
      tab: over ?? "courses",
      drill: connectionId.success
        ? { kind: "connection", connectionId: connectionId.data }
        : null,
    };
  }
  if (id === RESULT_PATH) {
    const resultId = ResultIdSchema.safeParse(decoded(params.resultId));
    return {
      tab: over ?? "generate",
      drill: resultId.success
        ? { kind: "generated-plan", resultId: resultId.data }
        : null,
    };
  }
  return null;
}

/**
 * The URL's location as soon as it changes: the history tells its
 * subscribers at once, while the router's state follows once the route has
 * loaded. The sidebar answers a click in the same frame (a route whose chunk
 * is still coming shows its skeleton).
 */
export function useLatestLocation(): ParsedLocation {
  const router = useRouter();
  const raw = useSyncExternalStore(
    router.history.subscribe,
    () => router.history.location,
    () => router.history.location,
  );
  return useMemo(() => router.parseLocation(raw), [router, raw]);
}

/** The view on screen: the URL's, or the saved one while `/schedule` opens it. */
export function useScheduleView(): ScheduleView {
  const router = useRouter();
  const location = useLatestLocation();
  const lastTab = useUi((s) => s.lastTab);
  return useMemo(
    () => viewAt(router, location) ?? { tab: lastTab, drill: null },
    [router, location, lastTab],
  );
}

/** Whether the URL itself names a view (not plain `/schedule`). */
export function useViewInUrl(): boolean {
  const router = useRouter();
  const location = useLatestLocation();
  return viewAt(router, location) !== null;
}

/** The course open in the sidebar (course details on top), if any. */
export function useOpenCourse(): string | null {
  const { drill } = useScheduleView();
  return drill?.kind === "course" ? drill.courseCode : null;
}

/**
 * The course whose sections the calendar shows as ghosts: a hovered search
 * result first, else the course open in the sidebar.
 */
export function useGhostCourse(): string | null {
  const open = useOpenCourse();
  return useUi((s) => s.hoverCourse) ?? open;
}

/**
 * The URL's own params for a tab's route while it's on screen (Search's text,
 * Generate's results), else null. Hidden panels keep what they last showed.
 */
export function useTabSearch(tab: RailTab): Record<string, unknown> | null {
  const router = useRouter();
  const location = useLatestLocation();
  return routeAt(router, location.pathname).id === TAB_PATHS[tab]
    ? location.search
    : null;
}

/** A drill-in's short name: "CMSC351", "Connection", "Option 3". */
export function drillName(entry: DrillEntry): string {
  switch (entry.kind) {
    case "course":
      return entry.courseCode;
    case "connection":
      return "Connection";
    case "generated-plan":
      return resultName(entry.resultId);
  }
}

/** Whether a drill-in's name is set in Geist Mono (codes). */
export function drillMono(entry: DrillEntry): boolean {
  return entry.kind === "course";
}

/** A generated plan's name, while its run is here: "Option 3". */
function resultName(resultId: string): string {
  const { status } = useGenerateRun.getState();
  if (status.kind !== "done") return "Plan";
  const i = status.result.results.findIndex((r) => r.id === resultId);
  return i >= 0 ? optionLabel(i + 1) : "Plan";
}

/** The view by its short name, for Back's label: "Search", "CMSC351". */
export function viewName(view: ScheduleView): { label: string; mono: boolean } {
  if (view.drill)
    return { label: drillName(view.drill), mono: drillMono(view.drill) };
  return { label: tabById(view.tab).label, mono: false };
}
