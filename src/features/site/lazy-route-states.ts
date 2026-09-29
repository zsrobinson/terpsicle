import { lazyRouteComponent } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { NotFoundPage } from "./not-found-page";
import { RouteError, RoutePending } from "./route-states";

// What the router shows while a route loads, when it fails, and where no
// route matches (./route-states.tsx, ./not-found-page.tsx), as the server and
// the browser each need them. All three draw the family bar, and with it the
// account menu, the bell and the product menu, which `/` never shows: in the
// browser they're chunks of their own (scripts/check-bundle.ts keeps them out
// of `/`'s first load).
//
// The server renders them straight away: the Worker draws the pending state
// for pages that render only in the browser (`ssr: false`), and the 404 page,
// so they have to be there before the first byte. Start's compiler drops the
// server branch, and the static imports with it, from the browser's build.

const states = () => import("./route-states");
const LazyRoutePending = lazyRouteComponent(states, "RoutePending");
const LazyRouteError = lazyRouteComponent(states, "RouteError");
const LazyNotFoundPage = lazyRouteComponent(
  () => import("./not-found-page"),
  "NotFoundPage",
);

/** Fetches their code; resolves at once when it's already here. */
export async function preloadRouteStates(): Promise<void> {
  await Promise.all([
    LazyRoutePending.preload?.(),
    LazyRouteError.preload?.(),
    LazyNotFoundPage.preload?.(),
  ]);
}

export const routeStates = createIsomorphicFn()
  .server(() => ({ RoutePending, RouteError, NotFoundPage }))
  .client(() => ({
    RoutePending: LazyRoutePending,
    RouteError: LazyRouteError,
    NotFoundPage: LazyNotFoundPage,
  }));
