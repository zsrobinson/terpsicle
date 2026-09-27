import { createFileRoute } from "@tanstack/react-router";
import { SearchView } from "~/features/four-year/search-panel";

// Plan's Search view (V3 §2.13), in the sidebar: `?q=` is its text, and
// `?gened=` or `?wildcard=` narrow it (~/core/schema/plan-url).
export const Route = createFileRoute("/plan/search")({
  component: SearchView,
});
