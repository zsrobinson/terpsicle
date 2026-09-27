import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { SearchTabSearchSchema } from "~/core/schema/schedule-url";
import { SearchPanel } from "~/features/search/search-panel";

// The Search tab (SPEC §3.5): `?q=` is its text (typing replaces the entry)
// and the filter chips are places (each pushes one). Its panel shows in the
// sidebar (src/app/sidebar.tsx), in its own chunk.
export const Route = createFileRoute("/schedule/search")({
  validateSearch: SearchTabSearchSchema,
  component: SearchPanel,
});
