import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TestSignInPage } from "~/features/auth/test-sign-in-page";

// Test mode's sign-in (V2.md §4.6): previews, `pnpm dev:mock` and e2e only.
export const Route = createFileRoute("/auth/test")({
  ssr: false,
  validateSearch: z.object({
    return: z.string().max(512).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Test sign-in · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestSignInRoute,
});

function TestSignInRoute() {
  const search = Route.useSearch();
  return <TestSignInPage returnTo={search.return} />;
}
