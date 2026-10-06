import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "~/features/site/privacy-page";

// Google's OAuth consent screen links here, and checks that it loads.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · Terpsicle" },
      {
        name: "description",
        content:
          "What Terpsicle keeps about you, why, who else touches it, how long we keep it and how to delete it.",
      },
    ],
  }),
  component: PrivacyPage,
});
