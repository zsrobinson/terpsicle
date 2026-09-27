import { createFileRoute } from "@tanstack/react-router";
// Not the barrel: the route tree carries this schema to every page.
import { DrillSearchSchema } from "~/core/schema/schedule-url";
import { CourseDetails } from "~/features/course-details/course-details";

// Course details (SPEC §3.4), drilled in over `?tab=` (Courses when absent):
// `/schedule/course/CMSC351?tab=search`. The sidebar shows it over its tab.
export const Route = createFileRoute("/schedule/course/$code")({
  validateSearch: DrillSearchSchema,
  component: CourseDetails,
});
