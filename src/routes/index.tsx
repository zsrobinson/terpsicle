import { createFileRoute, redirect } from "@tanstack/react-router";
import { landingCheckScript, savedWorkInBrowser } from "~/app/landing";
import { SCHEDULE_PATH } from "~/core/site";
import { MarketingPage } from "~/features/site/marketing-page";

// The marketing page, server-rendered so it shows without the app's code.
// Returning visitors skip it: one with a session cookie is redirected by the
// Worker (src/server/worker.ts); one with saved plans by the head script on
// a full load, or by `beforeLoad` when the router navigates here.
export const Route = createFileRoute("/")({
  head: () => ({
    scripts: [{ children: landingCheckScript }],
  }),
  beforeLoad: async () => {
    if (await savedWorkInBrowser())
      throw redirect({ to: SCHEDULE_PATH, replace: true });
  },
  component: MarketingPage,
});
