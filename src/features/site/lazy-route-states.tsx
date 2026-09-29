import type { ErrorComponentProps } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { LazyTooltip } from "~/components/lazy-tooltip";
import { lazyComponent } from "~/lib/lazy-component";
import { Button } from "~/ui/button";
import { reloadPage } from "~/ui/reload";
import { NotFoundPage } from "./not-found-page";
import { RouteError, RoutePending } from "./route-states";

// What the router shows while a route loads, when it fails, and where no
// route matches (./route-states.tsx, ./not-found-page.tsx), as the server and
// the browser each need them. All three draw the family bar, and with it the
// account menu, the bell and the product menu, which `/` never shows: in the
// browser they're chunks of their own (scripts/check-bundle.ts keeps them out
// of `/`'s first load; the service worker keeps them for offline,
// scripts/pwa-precache.ts).
//
// The server renders them straight away: the Worker draws the pending state
// for pages that render only in the browser (`ssr: false`), and the 404 page,
// so they have to be there before the first byte. Start's compiler drops the
// server branch, and the static imports with it, from the browser's build.
//
// A failure is exactly when their code may not arrive (offline, or a deploy
// removed the chunk), so each has a plain stand-in without the bar that
// needs nothing more than the page already has, and asks again when it's
// back online (~/lib/lazy-component).

/** When the failure state's own code didn't arrive: what happened, and Reload. */
export function RouteErrorUnavailable() {
  return (
    <main className="flex min-h-dvh flex-col items-start gap-2 bg-bg p-4 text-fg">
      <h1 className="font-semibold text-lg">This page didn't load</h1>
      <p role="status">
        Part of Terpsicle didn't arrive. Check your connection, then reload.
      </p>
      <LazyTooltip label="Load this page again">
        <Button variant="outline" size="sm" onClick={() => reloadPage()}>
          Reload
        </Button>
      </LazyTooltip>
    </main>
  );
}

/** When the 404 page's own code didn't arrive: it still says so. */
export function NotFoundUnavailable() {
  return (
    <main className="flex min-h-dvh flex-col items-start gap-2 bg-bg p-4 text-fg">
      <h1 className="font-semibold text-lg">Page not found</h1>
      <p>There's nothing at this address.</p>
    </main>
  );
}

const LazyRoutePending = lazyComponent<object>(
  () => import("./route-states").then((m) => m.RoutePending),
  // Loading, without the bar: the page itself shows next.
  () => null,
);
const LazyRouteError = lazyComponent<ErrorComponentProps>(
  () => import("./route-states").then((m) => m.RouteError),
  RouteErrorUnavailable,
);
const LazyNotFoundPage = lazyComponent<object>(
  () => import("./not-found-page").then((m) => m.NotFoundPage),
  NotFoundUnavailable,
);

/** Fetches their code; settles at once when it's already here. */
export async function preloadRouteStates(): Promise<void> {
  await Promise.all([
    LazyRoutePending.preload(),
    LazyRouteError.preload(),
    LazyNotFoundPage.preload(),
  ]);
}

export const routeStates = createIsomorphicFn()
  .server(() => ({ RoutePending, RouteError, NotFoundPage }))
  .client(() => ({
    RoutePending: LazyRoutePending,
    RouteError: LazyRouteError,
    NotFoundPage: LazyNotFoundPage,
  }));
