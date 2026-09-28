import { createFileRoute, redirect } from "@tanstack/react-router";

// The Register tab was Export until 2026-09-28 (docs/decisions.md): links and
// bookmarks from before land on it, replacing the entry.
export const Route = createFileRoute("/schedule/export")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/schedule/register", search, replace: true });
  },
});
