import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyPlanLocation } from "~/core/routing/plan-location";
// Not the barrel: the route tree carries this schema to every page.
import { LegacyPlanSearchSchema } from "~/core/schema/plan-url";
import { GenEdView } from "~/features/four-year/gen-ed-panel";

// Plan's GenEd view, its first (V3 §2.7), in the sidebar at `/plan`. Links
// from before each view was a route (`/plan?tab=search&q=…`) go to their
// view's, replacing the entry.
export const Route = createFileRoute("/plan/")({
  validateSearch: LegacyPlanSearchSchema,
  beforeLoad: ({ search }) => {
    const location = legacyPlanLocation(search);
    if (location) throw redirect({ ...location, replace: true });
  },
  component: GenEdView,
});
