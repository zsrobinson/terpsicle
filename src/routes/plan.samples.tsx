import { createFileRoute } from "@tanstack/react-router";
import { SamplesView } from "~/features/four-year/template-panel";

// Plan's Samples view (V3 §2.11): sample plans to start from, in the
// sidebar, in their own chunk.
export const Route = createFileRoute("/plan/samples")({
  staticData: { planView: "templates" },
  component: SamplesView,
});
