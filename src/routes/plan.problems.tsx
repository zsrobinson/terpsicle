import { createFileRoute } from "@tanstack/react-router";
import { ProblemsView } from "~/features/four-year/problems-panel";

// Plan's Problems view (V3 §2.8), in the sidebar, in its own chunk.
export const Route = createFileRoute("/plan/problems")({
  component: ProblemsView,
});
