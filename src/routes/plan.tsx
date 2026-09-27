import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { initAnalytics } from "~/app/analytics";
import { type PlanSearch, PlanSearchSchema } from "~/core/schema";
import { PlanPage } from "~/features/four-year";
import type { PlanNavOptions } from "~/features/four-year/model";

// Terpsicle Plan (docs/V3.md §1.1, §2.13): the four-year plan. It lives in
// this browser's IndexedDB, so it renders in the browser only.
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
  const navigate = useNavigate({ from: "/plan" });
  const router = useRouter();

  useEffect(() => {
    void initAnalytics();
  }, []);

  const nav = useMemo(
    () => ({
      search,
      go: (patch: Partial<PlanSearch>, options: PlanNavOptions = {}) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: options.replace ?? false,
          ...(options.drill
            ? { state: (prev) => ({ ...prev, [DRILL_KEY]: true }) }
            : {}),
        }),
      back: (patch: Partial<PlanSearch>) => {
        const state = router.history.location.state as unknown as Record<
          string,
          unknown
        >;
        if (state[DRILL_KEY] === true) router.history.back();
        else
          void navigate({
            search: (prev) => ({ ...prev, ...patch }),
            replace: true,
          });
      },
    }),
    [search, navigate, router],
  );

  return <PlanPage nav={nav} />;
}
