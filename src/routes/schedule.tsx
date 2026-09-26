import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { z } from "zod";
import { initAnalytics, track } from "~/app/analytics";
import { App } from "~/app/app";
import { clientConfig } from "~/app/config";

// The scheduler (`SCHEDULE_PATH` in ~/core/routing). `?plan=` carries a shared
// plan (DATA.md §8). The router may parse a numeric-looking value as a
// number, so accept both and keep the text.
const searchSchema = z.object({
  plan: z
    .union([z.string(), z.number()])
    .transform(String)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/schedule")({
  // Everything lives in the browser (IndexedDB, web worker); the Worker only
  // serves the shell (BUILD.md §4).
  ssr: false,
  validateSearch: searchSchema,
  component: SchedulePage,
});

function SchedulePage() {
  const { plan } = Route.useSearch();
  const navigate = useNavigate({ from: "/schedule" });
  const clearShared = useCallback(() => {
    void navigate({ search: {}, replace: true });
  }, [navigate]);

  useEffect(() => {
    void initAnalytics();
    track("app_loaded", { dataSource: clientConfig.dataSource });
  }, []);

  return <App sharedParam={plan} onClearShared={clearShared} />;
}
