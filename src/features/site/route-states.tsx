import {
  type ErrorComponentProps,
  rootRouteId,
  useMatch,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { logError } from "~/app/activity-log";
import { isChunkLoadError } from "~/app/panel-load-boundary";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { ProductPage } from "~/ui/product-page";
import { PageSkeleton } from "~/ui/skeleton";
import { TooltipProvider } from "~/ui/tooltip";
import { SiteHeader } from "./site-page";

// What every route shows while it loads and when it fails (docs/COHESION.md
// §3, Phase 2), set once as the router's defaults. A page in its own right
// keeps the family bar, so the frame never blinks out; inside another
// route's page, the same states sit in place, without a second bar.
//
// A route says how it loads with `staticData.pending` (below), so the
// default can't disagree with the page. The Worker renders this pending
// state for routes that render only in the browser (`ssr: false`), so those
// paint the bar at once instead of a blank page.

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /**
     * What the page shows while it loads:
     * - `bar` (the default): the family bar over an empty page. Every page
     *   under it lays out its own column, so nothing jumps sideways.
     * - `reading`: the bar over a reading-width skeleton, for pages whose
     *   loader can be slow on a client-side visit (Reviews).
     * - `none`: nothing, for pages with a frame of their own (sign-in, admin).
     */
    pending?: "bar" | "reading" | "none";
  }
}

/** The nearest route's match id, and what it says about loading. */
function useRouteMatch() {
  const id = useMatch({ strict: false, select: (m) => m.id });
  const pending = useMatch({
    strict: false,
    select: (m) => m.staticData?.pending ?? "bar",
  });
  return { id, pending };
}

/** A route rendered straight under the root is a whole page. */
function useIsPage(id: string): boolean {
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.id === id);
      return index < 1 || s.matches[index - 1]?.routeId === rootRouteId;
    },
  });
}

// Its own tooltip provider: the root route's pending state renders before
// the root layout, whose provider every other page sits in.
function Frame({
  placeholder = false,
  children,
}: {
  /**
   * The bar while the page loads: the page brings its own bar, which
   * replaces this one, so this one takes no taps or focus (a menu opened
   * here would vanish) and says only "Loading".
   */
  placeholder?: boolean;
  children?: ReactNode;
}) {
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        {placeholder ? (
          <>
            <div inert aria-hidden="true" data-slot="bar-placeholder">
              <SiteHeader />
            </div>
            <p role="status" className="sr-only">
              Loading
            </p>
          </>
        ) : (
          <SiteHeader />
        )}
        {children}
      </div>
    </TooltipProvider>
  );
}

/** Loading: the bar, and a skeleton where the route asks for one. */
export function RoutePending() {
  const { id, pending } = useRouteMatch();
  const isPage = useIsPage(id);
  if (!isPage) return <PageSkeleton className="p-4" />;
  if (pending === "none") return null;
  if (pending === "bar") return <Frame placeholder />;
  return (
    <Frame placeholder>
      <ProductPage width="reading">
        {/* The frame already says "Loading". */}
        <div aria-hidden="true">
          <PageSkeleton />
        </div>
      </ProductPage>
    </Frame>
  );
}

/** Why a route didn't load, in one sentence, and what Try again will do. */
export function routeErrorLine(error: unknown, online: boolean): string {
  if (!online) return "You're offline. Try again once you're connected.";
  // A failed import() stays failed until the page reloads. load-recovery.ts
  // usually reloads first; this is when it already has, a moment ago.
  if (isChunkLoadError(error))
    return "Part of Terpsicle didn't arrive, likely because a new version just went out. Try again to get it.";
  return "Something went wrong on our side. Try again, and if it keeps happening, send us feedback.";
}

/** A route that threw: the bar, what happened and Try again. Never red. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { id } = useRouteMatch();
  const isPage = useIsPage(id);
  const online = typeof navigator === "undefined" || navigator.onLine;
  const chunk = isChunkLoadError(error);
  // So "Send feedback" can include what went wrong: the router catches it
  // before it reaches the window's error handler.
  useEffect(() => logError(error), [error]);
  const retry = () => {
    if (chunk) window.location.reload();
    // Run the loaders again, then show the route in place of this.
    else void router.invalidate().then(reset);
  };
  const note = (
    <InlineError
      message={routeErrorLine(error, online)}
      onRetry={retry}
      retryTooltip={chunk ? "Reload the page" : "Load this again"}
      className={isPage ? undefined : "px-4"}
    />
  );
  if (!isPage) return note;
  return (
    <Frame>
      <ProductPage width="note">
        <PageHeader title="This page didn't load" />
        {note}
      </ProductPage>
    </Frame>
  );
}
