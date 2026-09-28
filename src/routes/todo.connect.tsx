import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { ConnectPage } from "~/features/todo";
import { initAnalytics } from "~/lib/analytics";

// Connect ELMS, see the connection, disconnect, add a calendar file
// (docs/V3.md §3.2, §3.7).
export const Route = createFileRoute("/todo/connect")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ELMS link · Todo · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectRoute,
});

function ConnectRoute() {
  useEffect(() => {
    void initAnalytics();
  }, []);
  return <ConnectPage />;
}
