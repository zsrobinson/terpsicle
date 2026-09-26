import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { initAnalytics, stopSessionRecording } from "~/app/analytics";
import { ConnectPage } from "~/features/todo";

// Connect ELMS, see the connection, disconnect, add a calendar file
// (docs/V3.md §3.2, §3.7).
export const Route = createFileRoute("/todo/connect")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connect ELMS · Todo · Terpsicle" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConnectRoute,
});

function ConnectRoute() {
  useEffect(() => {
    // No session recordings on Todo (V3.md §6).
    stopSessionRecording();
    void initAnalytics();
  }, []);
  return <ConnectPage />;
}
