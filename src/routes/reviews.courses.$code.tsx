import { createFileRoute } from "@tanstack/react-router";
import { CourseRoute } from "~/features/reviews/course-page";

// A course's grades, instructors and reviews (V2.md §1.1).
export const Route = createFileRoute("/reviews/courses/$code")({
  head: ({ params }) => ({
    meta: [{ title: `${params.code.toUpperCase()} reviews · Terpsicle` }],
  }),
  component: CourseRouteComponent,
});

function CourseRouteComponent() {
  const { code } = Route.useParams();
  return <CourseRoute code={code} />;
}
