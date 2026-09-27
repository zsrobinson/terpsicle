import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdminFrame } from "~/features/admin/admin-frame";
import { QueuePage } from "~/features/admin/queue-page";

// The owner's moderation queue (V2 §10). The Worker lets only admins load
// it (src/server/auth/pages.ts). `?show=decided` lists recent decisions, so
// Back returns to the waiting list.
export const Route = createFileRoute("/admin/")({
  ssr: false,
  validateSearch: z.object({
    show: z.literal("decided").optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Admin · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminQueueRoute,
});

function AdminQueueRoute() {
  const { show } = Route.useSearch();
  return (
    <AdminFrame>
      <QueuePage view={show ?? "waiting"} />
    </AdminFrame>
  );
}
