import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "~/features/site/site-page";

// Terpsicle Reviews: a stub until the reviews track fills it in.
export const Route = createFileRoute("/reviews/")({
  head: () => ({ meta: [{ title: "Reviews · Terpsicle" }] }),
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <ComingSoonPage title="Terpsicle Reviews">
      Read and write reviews of UMD courses and instructors.
    </ComingSoonPage>
  );
}
