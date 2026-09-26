import { createFileRoute } from "@tanstack/react-router";
import { InstructorRoute } from "~/features/reviews/instructor-page";

// An instructor's numbers, AI summary and reviews (V2.md §1.1). `$id` is a
// PlanetTerp slug or a minted `t~` id; `?course=CMSC351` narrows it. The
// page checks both: every route's search schema loads on every page.
export const Route = createFileRoute("/reviews/instructors/$id")({
  validateSearch: (search: Record<string, unknown>): { course?: string } =>
    typeof search.course === "string" ? { course: search.course } : {},
  head: () => ({ meta: [{ title: "Instructor reviews · Terpsicle" }] }),
  component: InstructorRouteComponent,
});

function InstructorRouteComponent() {
  const { id } = Route.useParams();
  const { course } = Route.useSearch();
  return <InstructorRoute id={id} course={course} />;
}
