import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { initAnalytics } from "~/app/analytics";
import { type PlanSearch, PlanSearchSchema } from "~/core/schema";
import { PlanPage } from "~/features/four-year";

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

function PlanRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/plan" });

  useEffect(() => {
    void initAnalytics();
  }, []);

  const nav = useMemo(
    () => ({
      search,
      go: (patch: Partial<PlanSearch>, options?: { replace?: boolean }) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: options?.replace ?? false,
        }),
    }),
    [search, navigate],
  );

  return <PlanPage nav={nav} />;
}
