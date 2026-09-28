import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { NotificationsPage } from "~/features/notifications/notifications-page";
import { initAnalytics } from "~/lib/analytics";

// Notifications (V2.md §6.2): every type and channel, this device, and the
// devices with notifications on. Its own page, beside /settings rather than
// inside it (the `_` keeps it out of the settings route's layout).
export const Route = createFileRoute("/settings_/notifications")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Notifications · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  useEffect(() => {
    void initAnalytics();
  }, []);
  return <NotificationsPage />;
}
