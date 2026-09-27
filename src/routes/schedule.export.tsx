import { createFileRoute } from "@tanstack/react-router";
import { ExportPanel } from "~/features/export/export-panel";

// The Export tab (SPEC §3.10), with the .ics builder. Its panel shows in the
// sidebar (src/app/sidebar.tsx), in its own chunk, loaded on first use or on
// intent (hovering its rail tab).
export const Route = createFileRoute("/schedule/export")({
  component: ExportPanel,
});
