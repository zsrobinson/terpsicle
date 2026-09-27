import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { GenerateTabSearchSchema } from "~/core/schema/schedule-url";
import { GeneratePanel } from "~/features/generate/generate-panel";

// The Generate tab (SPEC §3.9): the form, or `?view=results`, the last run's
// results (a place of their own: Back returns to the form). The form, the
// results and the generator's worker client load with this route's chunk.
export const Route = createFileRoute("/schedule/generate")({
  validateSearch: GenerateTabSearchSchema,
  component: GeneratePanel,
});
