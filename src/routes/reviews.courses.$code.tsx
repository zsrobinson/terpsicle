import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { courseHead, notFoundHead } from "~/core/seo";
import { CoursePage } from "~/features/reviews/course-page";
import { ReviewsNotFound } from "~/features/reviews/not-found";
import {
  courseSuggestions,
  loadCoursePage,
  parseCourseParam,
} from "~/features/reviews/page-data";
import { routeHead } from "~/features/reviews/route-head";

// A course's grades, instructors and reviews (V2.md §1.1), rendered on the
// server for search engines. An unknown code is a real 404.
export const Route = createFileRoute("/reviews/courses/$code")({
  // The loader's data code is its own chunk, like the page: nothing of
  // Reviews loads with other pages (scripts/check-bundle.ts).
  codeSplitGroupings: [["loader"], ["component"], ["notFoundComponent"]],
  loader: async ({ params, serverContext }) => {
    const code = parseCourseParam(params.code);
    // One URL per course: /reviews/courses/cmsc351 moves to CMSC351.
    if (code && code !== params.code)
      throw redirect({
        to: "/reviews/courses/$code",
        params: { code },
        statusCode: 301,
      });
    const data = code ? await loadCoursePage(code, serverContext) : null;
    if (!data)
      throw notFound({
        data: {
          suggestions: await courseSuggestions(params.code, serverContext),
        },
      });
    return data;
  },
  head: ({ loaderData }) =>
    routeHead(loaderData ? courseHead(loaderData) : notFoundHead("Course")),
  component: CourseRouteComponent,
  notFoundComponent: ({ data }) => (
    <ReviewsNotFound what="course" data={data} />
  ),
});

function CourseRouteComponent() {
  const data = Route.useLoaderData();
  return <CoursePage key={data.code} data={data} />;
}
