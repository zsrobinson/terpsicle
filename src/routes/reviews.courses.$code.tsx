import { createFileRoute, redirect } from "@tanstack/react-router";

// The old address of a course's page. Pages moved one level up (owner,
// 2026-09-28): /reviews/courses/CMSC351 → /reviews/cmsc351, for good.
export const Route = createFileRoute("/reviews/courses/$code")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/reviews/$slug",
      params: { slug: params.code.toLowerCase() },
      statusCode: 301,
    });
  },
});
