import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { DrillSearchSchema } from "~/core/schema/schedule-url";
import { ConnectionDetails } from "~/features/travel/connection-details";

// Connection details (SPEC §3.7): the walk between two back-to-back classes,
// drilled in over `?tab=`. Opened from Travel, the calendar's pills and
// Problems.
export const Route = createFileRoute("/schedule/connection/$connectionId")({
  validateSearch: DrillSearchSchema,
  component: ConnectionDetails,
});
