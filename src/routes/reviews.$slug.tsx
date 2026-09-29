import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ReviewsPageSearchSchema } from "~/core/schema";
import { courseHead, instructorHead, notFoundHead } from "~/core/seo";
import { CoursePage } from "~/features/reviews/course-page";
import { InstructorPage } from "~/features/reviews/instructor-page";
import { ReviewsNotFound } from "~/features/reviews/not-found";
import {
  courseSuggestions,
  instructorSuggestions,
  loadReviewsPage,
} from "~/features/reviews/page-data";
import { routeHead } from "~/features/reviews/route-head";

// An instructor's or a course's page (V2.md §1.1): /reviews/kruskal,
// /reviews/cmsc351. One level under /reviews, so a search result reads
// like a name (owner, 2026-09-28); a course code is four letters and three
// digits, which nobody's name is (src/core/reviews/slugs.ts). Rendered on
// the server, reviews and all, and cached at the edge. `?course=CMSC351`
// narrows an instructor's page (and canonicalizes to the whole page); an
// unknown address is a real 404, with "Did you mean…".
export const Route = createFileRoute("/reviews/$slug")({
  validateSearch: ReviewsPageSearchSchema,
  loaderDeps: ({ search }) => ({ course: search.course, sort: search.sort }),
  // The loader's data code is its own chunk, like the page: nothing of
  // Reviews loads with other pages (scripts/check-bundle.ts).
  // Picking a course changes `?course=` and runs the loader again: the page
  // stays put while it does, never a loading state. From another page, a
  // slow one loads under the bar as a reading page.
  staticData: { pending: "reading" },
  pendingMs: Number.POSITIVE_INFINITY,
  codeSplitGroupings: [["loader"], ["component"], ["notFoundComponent"]],
  loader: async ({ params, deps, serverContext }) => {
    const page = await loadReviewsPage(
      params.slug,
      deps.course,
      serverContext,
      deps.sort,
    );
    // One address per page: /reviews/CMSC351 and /reviews/goldman_aaron move.
    if (page.kind === "moved")
      throw redirect({
        to: "/reviews/$slug",
        params: { slug: page.slug },
        search: (s) => s,
        statusCode: 301,
      });
    if (page.kind === "missing")
      throw notFound({
        data: {
          what: page.what,
          suggestions:
            page.what === "course"
              ? await courseSuggestions(params.slug, serverContext)
              : await instructorSuggestions(params.slug, serverContext),
        },
      });
    return page;
  },
  head: ({ loaderData }) =>
    routeHead(
      loaderData?.kind === "course"
        ? courseHead(loaderData.course)
        : loaderData?.kind === "instructor"
          ? instructorHead(loaderData.instructor)
          : notFoundHead("Page"),
    ),
  component: ReviewsSlugRoute,
  notFoundComponent: ({ data }) => <ReviewsNotFound data={data} />,
});

function ReviewsSlugRoute() {
  const page = Route.useLoaderData();
  const { write, sort } = Route.useSearch();
  return page.kind === "course" ? (
    <CoursePage
      key={page.course.code}
      data={page.course}
      reviews={page.reviews}
      write={write ?? null}
      sort={sort}
    />
  ) : (
    <InstructorPage
      key={page.instructor.id}
      data={page.instructor}
      reviews={page.reviews}
      write={write !== undefined}
      sort={sort}
    />
  );
}
