import { createFileRoute } from "@tanstack/react-router";
import { MyReviewsPage } from "~/features/reviews/mine-page";

// Your reviews and where each stands (V2.md §1.1). Signed in only; nothing
// here is worth rendering on the server.
export const Route = createFileRoute("/reviews/mine")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your reviews · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyReviewsPage,
});
