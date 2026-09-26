import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { initAnalytics } from "~/app/analytics";
import { SettingsPage } from "~/features/auth/settings-account";

// Account settings (V2.md §1.1): your Google name and picture, the email and
// directory ID, sign out, delete the account.
export const Route = createFileRoute("/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Settings · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  // Counted like the products' pages; autocapture stays off here
  // (~/core/analytics).
  useEffect(() => {
    void initAnalytics();
  }, []);
  return <SettingsPage />;
}
