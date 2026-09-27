import { createFileRoute } from "@tanstack/react-router";
import { ProblemsPanel } from "~/features/problems/problems-panel";

// The Problems tab (SPEC §3.6). Its panel shows in the sidebar
// (src/app/sidebar.tsx), in its own chunk, loaded on first use or on intent
// (hovering its rail tab).
export const Route = createFileRoute("/schedule/problems")({
  component: ProblemsPanel,
});
