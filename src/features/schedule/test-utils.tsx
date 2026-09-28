// Rendering helpers for the shell's UI tests. Not used by the app.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouteComponent,
  RouterProvider,
  redirect,
  stringifySearchWith,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContext, useContext, useState } from "react";
import {
  canonicalScheduleLocation,
  TAB_PATHS,
} from "~/core/routing/schedule-location";
import type { RailTab } from "~/core/schema";
import {
  DrillSearchSchema,
  GenerateTabSearchSchema,
  LegacyScheduleSearchSchema,
  ScheduleSearchSchema,
  SearchTabSearchSchema,
} from "~/core/schema/schedule-url";
import type { DrillEntry, DrillKind } from "~/state/drill";
import { createTestQueryClient } from "~/state/query/testing";
import { loadStores } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { AppShell, type AppShellProps } from "./app-shell";
import { goTo, openDrill } from "./schedule-nav";

/** Components for the scheduler's routes, as its route files give them. */
export interface ShellRoutes {
  tabs?: Partial<Record<RailTab, RouteComponent>>;
  drills?: Partial<Record<DrillKind, RouteComponent>>;
}

const DRILL_PATHS: Record<DrillKind, string> = {
  course: "course/$code",
  connection: "connection/$connectionId",
  "generated-plan": "result/$resultId",
};

const PropsContext = createContext<AppShellProps>({});

function ScheduleRoute() {
  return <AppShell {...useContext(PropsContext)} />;
}

/**
 * The scheduler's route tree as src/routes/schedule.*.tsx has it (same ids,
 * search schemas and old-URL redirect), with the given components.
 */
export function createScheduleRouter(
  routes: ShellRoutes = {},
  path = "/schedule/courses",
): AnyRouter {
  const root = createRootRoute();
  const schedule = createRoute({
    getParentRoute: () => root,
    path: "schedule",
    validateSearch: ScheduleSearchSchema,
    component: ScheduleRoute,
  });
  const index = createRoute({
    getParentRoute: () => schedule,
    path: "/",
    validateSearch: LegacyScheduleSearchSchema,
    beforeLoad: ({ search }) => {
      const location = canonicalScheduleLocation(search);
      if (location) throw redirect({ ...location, replace: true } as never);
    },
  });
  const tabs = (Object.keys(TAB_PATHS) as RailTab[]).map((tab) =>
    createRoute({
      getParentRoute: () => schedule,
      path: tab,
      ...(tab === "search" ? { validateSearch: SearchTabSearchSchema } : {}),
      ...(tab === "generate"
        ? { validateSearch: GenerateTabSearchSchema }
        : {}),
      ...(routes.tabs?.[tab] ? { component: routes.tabs[tab] } : {}),
    }),
  );
  const drills = (Object.keys(DRILL_PATHS) as DrillKind[]).map((kind) =>
    createRoute({
      getParentRoute: () => schedule,
      path: DRILL_PATHS[kind],
      validateSearch: DrillSearchSchema,
      ...(routes.drills?.[kind] ? { component: routes.drills[kind] } : {}),
    }),
  );
  return createRouter({
    routeTree: root.addChildren([
      schedule.addChildren([index, ...tabs, ...drills]),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
    stringifySearch: stringifySearchWith(JSON.stringify),
  });
}

let current: AnyRouter | null = null;

/** Waits for the router to settle after a navigation (a click, Back). */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 50 && current?.state.status !== "idle"; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The URL the shell is on: `/schedule/course/CMSC351?tab=search`. */
export function currentPath(): string {
  const location = current?.history.location;
  return location ? `${location.pathname}${location.search}` : "";
}

/** Several features' routes as one. */
function mergeRoutes(
  routes: ShellRoutes | readonly ShellRoutes[],
): ShellRoutes {
  const list = Array.isArray(routes) ? routes : [routes as ShellRoutes];
  return {
    tabs: Object.assign({}, ...list.map((r) => r.tabs ?? {})),
    drills: Object.assign({}, ...list.map((r) => r.drills ?? {})),
  };
}

/** Opens a tab, as its rail button would (without the analytics). */
export function showTab(tab: RailTab): void {
  act(() => {
    useUi.getState().setSidebarOpen(true);
    goTo({ tab, drill: null });
  });
}

/** Opens a drill-in over the current tab, as `openCourse` and friends do. */
export function showDrill(entry: DrillEntry): void {
  act(() => openDrill(entry));
}

/** The shell on the stub catalog with nothing saved yet, plus the toaster. */
export async function renderShell({
  routes = {},
  path = "/schedule/courses",
  ...props
}: AppShellProps & {
  routes?: ShellRoutes | readonly ShellRoutes[];
  /** Where the shell opens. */
  path?: string;
} = {}): Promise<{
  user: ReturnType<typeof userEvent.setup>;
  router: AnyRouter;
  setProps: (next: AppShellProps) => void;
}> {
  await loadStores();
  const user = userEvent.setup();
  const router = createScheduleRouter(mergeRoutes(routes), path);
  current = router;
  await router.load();
  let setShellProps: (next: AppShellProps) => void = () => {};
  const queryClient = createTestQueryClient();
  function Tree() {
    const [shellProps, set] = useState<AppShellProps>(props);
    setShellProps = set;
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={0}>
          <PropsContext.Provider value={shellProps}>
            <RouterProvider router={router} />
          </PropsContext.Provider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }
  render(<Tree />);
  await settle();
  /** Re-renders with new props, as a URL change would. */
  const setProps = (next: AppShellProps) => act(() => setShellProps(next));
  return { user, router, setProps };
}
