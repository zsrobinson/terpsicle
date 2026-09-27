import { createFileRoute } from "@tanstack/react-router";
import { BlocksPanel } from "~/features/blocks/blocks-panel";

// The Blocks tab (SPEC §3.8). Its panel shows in the sidebar
// (src/app/sidebar.tsx), in its own chunk, loaded on first use or on intent
// (hovering its rail tab).
export const Route = createFileRoute("/schedule/blocks")({
  component: BlocksPanel,
});
