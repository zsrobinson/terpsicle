import { createFileRoute } from "@tanstack/react-router";
import { TravelPanel } from "~/features/travel/travel-panel";

// The Travel tab (SPEC §3.7). Its panel shows in the sidebar
// (src/features/schedule/sidebar.tsx), in its own chunk, loaded on first use or on intent
// (hovering its rail tab).
export const Route = createFileRoute("/schedule/travel")({
  component: TravelPanel,
});
