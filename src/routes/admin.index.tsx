import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "~/features/site/site-page";

// The owner's moderation view: a stub until moderation lands.
export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <ComingSoonPage title="Admin">
      Review what moderation flagged.
    </ComingSoonPage>
  );
}
