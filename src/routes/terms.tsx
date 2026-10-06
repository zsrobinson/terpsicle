import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "~/features/site/terms-page";

// The rules for using Terpsicle. Google's OAuth consent screen links here
// too, beside `/privacy`.
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use · Terpsicle" },
      {
        name: "description",
        content:
          "The rules for using Terpsicle, in plain words: who we are, what you can post, and what we can't promise.",
      },
    ],
  }),
  component: TermsPage,
});
