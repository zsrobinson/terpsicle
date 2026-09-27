import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "~/core/seo";
import { ReviewsPolicyPage } from "~/features/reviews/policy-page";
import { routeHead } from "~/features/reviews/route-head";

// What reviews can say, and how checks and removals work (V2.md §7.5).
export const Route = createFileRoute("/reviews/policy")({
  head: () =>
    routeHead(
      pageHead({
        title: "What's allowed · Terpsicle Reviews",
        description:
          "What Terpsicle reviews can and can't say, how each is checked before it's posted, and how removals work.",
        path: "/reviews/policy",
      }),
    ),
  component: ReviewsPolicyPage,
});
