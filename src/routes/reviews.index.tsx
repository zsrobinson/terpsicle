import { createFileRoute } from "@tanstack/react-router";
import { ReviewsHomeSearchSchema } from "~/core/schema";
import { reviewsHomeHead } from "~/core/seo";
import { ReviewsHomePage } from "~/features/reviews/home-page";
import { loadReviewsHome } from "~/features/reviews/page-data";
import { routeHead } from "~/features/reviews/route-head";

// Terpsicle Reviews (V2.md §1.1): find a course, or one of your classes.
// `?q=` is the search's text, so a department's link is a search; every
// view canonicalizes to /reviews.
export const Route = createFileRoute("/reviews/")({
  validateSearch: ReviewsHomeSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  // The loader's data code is its own chunk, like the page: nothing of
  // Reviews loads with other pages (scripts/check-bundle.ts).
  // Typing in the search changes `?q=` and runs the loader again: the page,
  // and the text being typed, stay put while it does, never a loading state.
  pendingMs: Number.POSITIVE_INFINITY,
  codeSplitGroupings: [["loader"], ["component"], ["notFoundComponent"]],
  loader: ({ deps, serverContext }) => loadReviewsHome(deps.q, serverContext),
  head: () => routeHead(reviewsHomeHead()),
  component: ReviewsHomeRoute,
});

function ReviewsHomeRoute() {
  const data = Route.useLoaderData();
  const { q } = Route.useSearch();
  return <ReviewsHomePage data={data} q={q ?? ""} />;
}
