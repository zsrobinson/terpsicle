import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "~/features/site/site-page";

// Account and notification settings: a stub until sign-in lands.
export const Route = createFileRoute("/settings/")({
  head: () => ({
    meta: [
      { title: "Settings · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <ComingSoonPage title="Settings">
      Choose which notifications you get, and how.
    </ComingSoonPage>
  );
}
