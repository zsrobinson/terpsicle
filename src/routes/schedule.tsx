import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { initAnalytics, track } from "~/app/analytics";
import { App } from "~/app/app";
import { clientConfig } from "~/app/config";
// Not the barrel: the route tree carries this schema to every page.
import { ScheduleSearchSchema } from "~/core/schema/schedule-url";

// The scheduler (`SCHEDULE_PATH` in ~/core/routing). Each rail tab and each
// drill-in is a child route (schedule.<tab>.tsx, schedule.course.$code.tsx,
// …) whose component the sidebar shows; this layout carries the params every
// view keeps: the term, the open plan, `?plan=` for a shared plan (DATA.md
// §8) and `?demo=1`. Old-style `/schedule?tab=&course=` links redirect in
// schedule.index.tsx. src/app/README.md, "URL state".
export const Route = createFileRoute("/schedule")({
  // Everything lives in the browser (IndexedDB, web worker); the Worker only
  // serves the shell (BUILD.md §4).
  ssr: false,
  validateSearch: ScheduleSearchSchema,
  component: SchedulePage,
});

function SchedulePage() {
  const { plan } = Route.useSearch();
  const router = useRouter();
  const clearShared = useCallback(() => {
    void router.navigate({
      to: router.state.location.pathname,
      search: (prev: Record<string, unknown>) => ({ ...prev, plan: undefined }),
      replace: true,
      state: (prev: object) => prev,
    } as never);
  }, [router]);

  useEffect(() => {
    void initAnalytics();
    track("app_loaded", { dataSource: clientConfig.dataSource });
  }, []);

  // The sidebar shows the child routes' views itself, keeping each mounted
  // while hidden (src/app/sidebar.tsx), so there's no <Outlet />.
  return <App sharedParam={plan} onClearShared={clearShared} />;
}
