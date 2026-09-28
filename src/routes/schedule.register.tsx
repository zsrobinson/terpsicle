import { createFileRoute } from "@tanstack/react-router";
import { RegisterPanel } from "~/features/register/register-panel";

// The Register tab (SPEC §3.10): the registration checklist, with the .ics
// builder. Its panel shows in the sidebar (src/features/schedule/sidebar.tsx), in its own
// chunk, loaded on first use or on intent (hovering its rail tab).
export const Route = createFileRoute("/schedule/register")({
  component: RegisterPanel,
});
