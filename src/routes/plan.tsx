import {
  createFileRoute,
  Outlet,
  useChildMatches,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { initAnalytics } from "~/app/analytics";
import { PLAN_VIEW_PATHS } from "~/core/routing/plan-location";
// Not the barrel: the route tree carries this schema to every page.
import { type PlanSearch, PlanSearchSchema } from "~/core/schema/plan-url";
import { PlanPage } from "~/features/four-year";
import type { PlanNav, PlanNavOptions } from "~/features/four-year/model";

// Terpsicle Plan (docs/V3.md §1.1, §2.13): the four-year plan, on the
// scheduler's workbench. Each view on its rail is a child route
// (plan.index.tsx is GenEd, plan.<view>.tsx the rest) whose panel shows in
// the sidebar, where this layout puts its <Outlet />; the search params
// every view keeps are here. It lives in this browser's IndexedDB, so it
// renders in the browser only.
export const Route = createFileRoute("/plan")({
  ssr: false,
  validateSearch: PlanSearchSchema,
  head: () => ({
    meta: [
      { title: "Plan · Terpsicle" },
      {
        name: "description",
        content:
          "Your four years at UMD, semester by semester: credits, GenEds and prerequisites.",
      },
    ],
  }),
  component: PlanRoute,
});

/** Marks a history entry the in-app Back may leave with the browser's Back. */
const DRILL_KEY = "planDrill";

function PlanRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    void initAnalytics();
  }, []);

  // The open view: its route says which (`staticData.planView`).
  const tab = useChildMatches({
    select: (matches) => matches[0]?.staticData.planView ?? "gened",
  });
  const nav = useMemo<PlanNav>(
    () => ({
      search: { ...search, tab },
      go: (patch, options: PlanNavOptions = {}) => {
        const { tab: next, ...rest } = patch;
        void navigate({
          // A view is a route; without one in the patch, the view stays.
          to: PLAN_VIEW_PATHS["tab" in patch ? (next ?? "gened") : tab],
          search: (prev: PlanSearch) => ({ ...prev, ...rest }),
          replace: options.replace ?? false,
          ...(options.drill
            ? { state: (prev) => ({ ...prev, [DRILL_KEY]: true }) }
            : {}),
        });
      },
      back: (patch: Partial<PlanSearch>) => {
        const state = router.history.location.state as unknown as Record<
          string,
          unknown
        >;
        if (state[DRILL_KEY] === true) router.history.back();
        else
          void navigate({
            to: PLAN_VIEW_PATHS[tab],
            search: (prev: PlanSearch) => ({ ...prev, ...patch }),
            replace: true,
          });
      },
    }),
    [search, tab, navigate, router],
  );

  return <PlanPage nav={nav} view={<Outlet />} />;
}
