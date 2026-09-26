import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "~/features/site/privacy-page";

// Google's OAuth consent screen links here, and checks that it loads.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · Terpsicle" },
      {
        name: "description",
        content: "What Terpsicle keeps about you, where, and why.",
      },
    ],
  }),
  component: PrivacyPage,
});
