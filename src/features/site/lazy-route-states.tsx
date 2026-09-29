import type { ErrorComponentProps } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
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
//
// Not the router's `lazyRouteComponent`: that expects the router to load it
// first, as it does a route's own components, and suspending on `use()`
// without it warns. These suspend the classic way until their code is here,
// and render at once after (the router preloads them, src/router.tsx).

type Component<P> = (props: P) => ReactNode;

function lazyState<P extends object>(
  load: () => Promise<Component<P>>,
): Component<P> & { preload: () => Promise<void> } {
  let Loaded: Component<P> | null = null;
  let loading: Promise<void> | null = null;
  let failed: unknown = null;
  const preload = () => {
    loading ??= load().then(
      (component) => {
        Loaded = component;
      },
      (error: unknown) => {
        failed = error;
      },
    );
    return loading;
  };
  function Lazy(props: P) {
    if (failed) throw failed;
    if (!Loaded) throw preload();
    return <Loaded {...props} />;
  }
  return Object.assign(Lazy, { preload });
}

const LazyRoutePending = lazyState<object>(() =>
  import("./route-states").then((m) => m.RoutePending),
);
const LazyRouteError = lazyState<ErrorComponentProps>(() =>
  import("./route-states").then((m) => m.RouteError),
);
const LazyNotFoundPage = lazyState<object>(() =>
  import("./not-found-page").then((m) => m.NotFoundPage),
);

/** Fetches their code; resolves at once when it's already here. */
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
