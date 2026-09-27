import { createFileRoute } from "@tanstack/react-router";
import { CoursesPanel } from "~/features/courses/courses-panel";

// The Courses tab (SPEC §3.1). Its panel shows in the sidebar
// (src/app/sidebar.tsx), in its own chunk, loaded on first use or on intent
// (hovering its rail tab).
export const Route = createFileRoute("/schedule/courses")({
  component: CoursesPanel,
});
