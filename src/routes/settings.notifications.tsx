import { createFileRoute, redirect } from "@tanstack/react-router";

// The address docs/V2.md §6.2 and the account menu name: notifications are a
// section of /settings (V2 §6.4, "As built"), so this goes there.
export const Route = createFileRoute("/settings/notifications")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/settings", hash: "notifications", replace: true });
  },
});
