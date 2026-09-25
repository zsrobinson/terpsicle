import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { initAnalytics, track } from "~/app/analytics";
import { AppShell } from "~/app/app-shell";
import { clientConfig } from "~/app/config";

export const Route = createFileRoute("/")({
  // Everything lives in the browser (IndexedDB, web worker); the Worker only
  // serves the shell (BUILD.md §4).
  ssr: false,
  component: IndexPage,
});

function IndexPage() {
  useEffect(() => {
    void initAnalytics();
    track("app_loaded", { dataSource: clientConfig.dataSource });
  }, []);
  return <AppShell />;
}
