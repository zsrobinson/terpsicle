import { createFileRoute } from "@tanstack/react-router";
import { GenEdView } from "~/features/four-year/gen-ed-panel";

// Plan's GenEd view, its first (V3 §2.7), in the sidebar at `/plan`.
export const Route = createFileRoute("/plan/")({
  staticData: { planView: "gened" },
  component: GenEdView,
});
