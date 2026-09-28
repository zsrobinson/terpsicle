import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SettingsPage } from "~/features/auth/settings-account";
import { initAnalytics } from "~/lib/analytics";

// Account settings (V2.md §1.1): your Google name, the email and
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
