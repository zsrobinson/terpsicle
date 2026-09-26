import { createFileRoute } from "@tanstack/react-router";
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
  component: SettingsPage,
});
