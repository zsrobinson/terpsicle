import { createFileRoute } from "@tanstack/react-router";
import { ReviewsPolicyPage } from "~/features/reviews/policy-page";

// What reviews can say, and how checks and removals work (V2.md §7.5).
export const Route = createFileRoute("/reviews/policy")({
  head: () => ({ meta: [{ title: "What's allowed · Terpsicle Reviews" }] }),
  component: ReviewsPolicyPage,
});
