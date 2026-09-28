import { createFileRoute, redirect } from "@tanstack/react-router";
import { instructorSlug } from "~/core/reviews/slugs";
import { ReviewsPageSearchSchema } from "~/core/schema";

// The old address of an instructor's page. Pages moved one level up (owner,
// 2026-09-28): /reviews/instructors/goldman_aaron?course=CMSC351 →
// /reviews/goldman-aaron?course=CMSC351, for good.
export const Route = createFileRoute("/reviews/instructors/$id")({
  validateSearch: ReviewsPageSearchSchema,
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/reviews/$slug",
      params: { slug: instructorSlug(params.id) },
      search: search.course ? { course: search.course } : {},
      statusCode: 301,
    });
  },
});
