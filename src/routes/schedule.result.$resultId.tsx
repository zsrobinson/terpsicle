import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { DrillSearchSchema } from "~/core/schema/schedule-url";
import { ResultDetails } from "~/features/generate/result-details";

// A generated plan's details (SPEC §3.9), over Generate's results. Results
// aren't saved, so after a reload the shell replaces this with Generate.
export const Route = createFileRoute("/schedule/result/$resultId")({
  validateSearch: DrillSearchSchema,
  component: ResultDetails,
});
