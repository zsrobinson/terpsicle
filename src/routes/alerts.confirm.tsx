import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ConfirmAlert } from "~/features/alerts/confirm-alert";

// The link in a seat-alert confirmation email (docs/DATA.md §7.1).
export const Route = createFileRoute("/alerts/confirm")({
  ssr: false,
  validateSearch: z.object({ token: z.string().optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Confirm seat alert · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token } = Route.useSearch();
  return <ConfirmAlert token={token} />;
}
