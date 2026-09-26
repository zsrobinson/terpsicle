import { createFileRoute } from "@tanstack/react-router";
import { ReviewsHomePage } from "~/features/reviews/home-page";

// Terpsicle Reviews (V2.md §1.1): find a course, or one of your classes.
export const Route = createFileRoute("/reviews/")({
  head: () => ({
    meta: [
      { title: "Reviews · Terpsicle" },
      {
        name: "description",
        content: "What students say about UMD courses and instructors.",
      },
    ],
  }),
  component: ReviewsHomePage,
});
