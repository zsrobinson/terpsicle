import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalScheduleLocation } from "~/core/routing/schedule-location";
// Not the barrel: the route tree carries this schema to every page.
import { LegacyScheduleSearchSchema } from "~/core/schema/schedule-url";

// Plain `/schedule` opens the saved view once local state has loaded
// (useScheduleNavigation in src/app/schedule-nav.ts). Old-style links
// (`?term=&course=` in seat-alert emails, `?tab=search&q=…` bookmarks) go
// to their view's route, replacing the entry.
export const Route = createFileRoute("/schedule/")({
  validateSearch: LegacyScheduleSearchSchema,
  beforeLoad: ({ search }) => {
    const location = canonicalScheduleLocation(search);
    if (location) throw redirect({ ...location, replace: true } as never);
  },
});
