import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "~/core/seo";
import { MyReviewsPage } from "~/features/reviews/mine-page";
import { routeHead } from "~/features/reviews/route-head";

// Your reviews and where each stands (V2.md §1.1). Signed in only; nothing
// here is worth rendering on the server, and search engines leave it out.
export const Route = createFileRoute("/reviews/mine")({
  ssr: false,
  head: () =>
    routeHead(
      pageHead({
        title: "Your reviews · Terpsicle",
        description: "Your reviews on Terpsicle, and where each stands.",
        path: "/reviews/mine",
        noindex: true,
      }),
    ),
  component: MyReviewsPage,
});
