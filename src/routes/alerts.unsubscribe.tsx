import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { UnsubscribeAlert } from "~/features/alerts/unsubscribe-alert";

// "Stop alerts" in seat-alert emails and their List-Unsubscribe header.
// Always asks before stopping (SPEC §3.12), so it's never one-click.
export const Route = createFileRoute("/alerts/unsubscribe")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Stop seat alerts · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  return <UnsubscribeAlert token={token} />;
}
