import { createFileRoute, notFound } from "@tanstack/react-router";
import { InstructorSearchSchema } from "~/core/schema";
import { instructorHead, notFoundHead } from "~/core/seo";
import { InstructorPage } from "~/features/reviews/instructor-page";
import { ReviewsNotFound } from "~/features/reviews/not-found";
import {
  instructorSuggestions,
  loadInstructorPage,
} from "~/features/reviews/page-data";
import { routeHead } from "~/features/reviews/route-head";

// An instructor's numbers, AI summary and reviews (V2.md §1.1), rendered on
// the server for search engines. `$id` is a PlanetTerp slug or a minted `t~`
// id; `?course=CMSC351` narrows it (and canonicalizes to the whole page).
// An unknown id is a real 404, with "Did you mean…".
export const Route = createFileRoute("/reviews/instructors/$id")({
  validateSearch: InstructorSearchSchema,
  loaderDeps: ({ search }) => ({ course: search.course }),
  // The loader's data code is its own chunk, like the page: nothing of
  // Reviews loads with other pages (scripts/check-bundle.ts).
  codeSplitGroupings: [["loader"], ["component"], ["notFoundComponent"]],
  loader: async ({ params, deps, serverContext }) => {
    const data = await loadInstructorPage(
      params.id,
      deps.course,
      serverContext,
    );
    if (!data)
      throw notFound({
        data: {
          suggestions: await instructorSuggestions(params.id, serverContext),
        },
      });
    return data;
  },
  head: ({ loaderData }) =>
    routeHead(
      loaderData ? instructorHead(loaderData) : notFoundHead("Instructor"),
    ),
  component: InstructorRouteComponent,
  notFoundComponent: ({ data }) => (
    <ReviewsNotFound what="instructor" data={data} />
  ),
});

function InstructorRouteComponent() {
  const data = Route.useLoaderData();
  return <InstructorPage key={data.id} data={data} />;
}
