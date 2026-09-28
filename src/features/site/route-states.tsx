import {
  type ErrorComponentProps,
  rootRouteId,
  useMatch,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { logError } from "~/app/activity-log";
import { AppBar } from "~/app/app-bar";
import { isChunkLoadError } from "~/app/panel-load-boundary";
import { MOBILE_QUERY } from "~/app/use-media-query";
import { SCHEDULE_PATH } from "~/core/routing";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { ProductPage } from "~/ui/product-page";
import { PageSkeleton, Skeleton } from "~/ui/skeleton";
import { TooltipProvider } from "~/ui/tooltip";
import { SiteHeader } from "./site-page";

// What every route shows while it loads and when it fails (docs/COHESION.md
// §3, Phase 2), set once as the router's defaults. A page in its own right
// keeps the family bar, so the frame never blinks out; inside another
// route's page, the same states sit in place, without a second bar.
//
// A route says how it loads with `staticData.pending` (below), so the
// default can't disagree with the page. A route whose loader runs again as
// you use the page (typing a search, picking a view) sets `pendingMs:
// Infinity` instead: the page stays put, and what you're typing with it. The Worker renders this pending
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
     * - `schedule`: the scheduler's own bar (the term and plans on their
     *   way, Feedback as an icon, no chip below 1536px), so a straight load
     *   of a tab doesn't draw the family bar and then change its shape.
     * - `none`: nothing, for a page with a frame of its own (none today:
     *   admin had one until it moved under the family bar).
     */
    pending?: "bar" | "reading" | "schedule" | "none";
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
  bar = <SiteHeader />,
  children,
}: {
  /** The bar to draw: the family bar, or a page's own shape of it. */
  bar?: ReactNode;
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
              {bar}
            </div>
            <p role="status" className="sr-only">
              Loading
            </p>
          </>
        ) : (
          bar
        )}
        {children}
      </div>
    </TooltipProvider>
  );
}

/**
 * The scheduler's bar (~/app/top-bar) before its code arrives: the same
 * family bar settings, with the term and plans as skeletons where it'll
 * show them. The Worker draws this for a page that renders only in the
 * browser, before anyone knows the screen's width: there it's the wide
 * shape, which folds its tabs into the product menu on a phone's width by
 * CSS, and the browser switches to the phone's `compact` one (MOBILE_QUERY,
 * as the scheduler) once it hydrates. Only ever one bar: two, even with one
 * hidden, are two bars to anything looking for the bar.
 */
function ScheduleBarPlaceholder() {
  const phone = usePhoneOrUnknown();
  const bar = (compact: boolean) => (
    <AppBar
      current="schedule"
      crowdedBelow2xl
      compact={compact}
      feedback="schedule"
      pathname={SCHEDULE_PATH}
      context={
        // Clipped, not overflowing: the server's wide shape on a phone's
        // width has less room than its skeletons, which slid under Feedback.
        <span className="flex min-w-0 items-center gap-3 overflow-hidden">
          <Skeleton className="h-4 w-20 shrink-0" />
          {compact ? null : (
            <span aria-hidden="true" className="text-faint">
              /
            </span>
          )}
          <Skeleton className="h-4 w-16 shrink-0" />
        </span>
      }
    />
  );
  return bar(phone === true);
}

/**
 * Whether the screen is a phone's (MOBILE_QUERY), or null in the server's
 * HTML, which can't know.
 */
function usePhoneOrUnknown(): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(MOBILE_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => null,
  );
}

/** Loading: the bar, and a skeleton where the route asks for one. */
export function RoutePending() {
  const { id, pending } = useRouteMatch();
  const isPage = useIsPage(id);
  if (!isPage) return <PageSkeleton className="p-4" />;
  if (pending === "none") return null;
  if (pending === "bar") return <Frame placeholder />;
  if (pending === "schedule")
    return <Frame placeholder bar={<ScheduleBarPlaceholder />} />;
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
