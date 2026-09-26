import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { initAnalytics, track } from "~/app/analytics";
import { App } from "~/app/app";
import { clientConfig } from "~/app/config";
import { useScheduleUrl } from "~/app/schedule-url";
import { urlSearch } from "~/core/routing/history";
// Not the barrel: the route tree carries this schema to every page.
import { ScheduleSearchSchema } from "~/core/schema/schedule-url";

// The scheduler (`SCHEDULE_PATH` in ~/core/routing). Its search params say
// where you are (the term, plan, tab, open course, Search's text and
// filters); `src/app/schedule-url.ts` keeps them and the app in step
// (src/app/README.md, "URL state"). `?plan=` carries a shared plan
// (DATA.md §8), and `?term=&course=` is the seat-alert emails' link.
export const Route = createFileRoute("/schedule")({
  // Everything lives in the browser (IndexedDB, web worker); the Worker only
  // serves the shell (BUILD.md §4).
  ssr: false,
  validateSearch: ScheduleSearchSchema,
  component: SchedulePage,
});

function SchedulePage() {
  const { plan } = Route.useSearch();
  const navigate = useNavigate({ from: "/schedule" });
  const clearShared = useCallback(() => {
    void navigate({
      search: (prev) => urlSearch({ ...prev, plan: undefined }),
      replace: true,
    });
  }, [navigate]);

  useScheduleUrl();
  useEffect(() => {
    void initAnalytics();
    track("app_loaded", { dataSource: clientConfig.dataSource });
  }, []);

  return <App sharedParam={plan} onClearShared={clearShared} />;
}
