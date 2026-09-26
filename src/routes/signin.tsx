import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SignInErrorSchema } from "~/core/schema";
import { SignInPage } from "~/features/auth/signin-page";

// Where sign-in errors land (V2.md §1.1), and test mode's sign-in.
export const Route = createFileRoute("/signin")({
  ssr: false,
  validateSearch: z.object({
    error: SignInErrorSchema.optional().catch(undefined),
    return: z.string().max(512).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const search = Route.useSearch();
  return <SignInPage error={search.error} returnTo={search.return} />;
}
