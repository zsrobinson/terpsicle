import {
  type ErrorComponentProps,
  rootRouteId,
  useMatch,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { ProductPage } from "~/ui/product-page";
import { PageSkeleton } from "~/ui/skeleton";
import { TooltipProvider, WithTooltip } from "~/ui/tooltip";
import { SiteHeader } from "./site-page";

// What every route shows while it loads and when it fails (docs/COHESION.md
// §3, Phase 2), set once as the router's defaults. A page in its own right
// keeps the family bar, so the frame never blinks out: loading is the bar
// and a skeleton, a failure is the bar, what happened and Try again. Inside
// another route's page, the same states sit in place, without a second bar.

/** Tools that fill the screen: a list skeleton is the wrong shape for them. */
const TOOLS = ["/schedule", "/plan", "/chat"];

/** The skeleton takes the column its page will, so nothing jumps sideways. */
const WIDTHS: [prefix: string, width: "note" | "reading" | "app"][] = [
  ["/settings", "note"],
  ["/signin", "note"],
  ["/todo/connect", "note"],
  ["/todo", "app"],
  ["/admin", "app"],
];

const under = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

/** A route rendered straight under the root is a whole page. */
function useIsPage(): boolean {
  const id = useMatch({ strict: false, select: (m) => m.id });
  return useRouterState({
    select: (s) => {
      const index = s.matches.findIndex((m) => m.id === id);
      return index < 1 || s.matches[index - 1]?.routeId === rootRouteId;
    },
  });
}

// Its own tooltip provider: the root route's pending state renders before
// the root layout, whose provider every other page sits in.
function Frame({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        <SiteHeader />
        {children}
      </div>
    </TooltipProvider>
  );
}

/**
 * Loading: the bar and a skeleton in the page's shape. The scheduler, Plan
 * and Chat draw their own panes, so they get the bar alone. It's also what
 * the Worker renders for a route that renders only in the browser.
 */
export function RoutePending() {
  const isPage = useIsPage();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!isPage) return <PageSkeleton className="p-4" />;
  if (TOOLS.some((t) => under(path, t)))
    return (
      <Frame>
        <div className="flex-1" />
      </Frame>
    );
  return (
    <Frame>
      <ProductPage
        width={WIDTHS.find(([prefix]) => under(path, prefix))?.[1] ?? "reading"}
      >
        <PageSkeleton />
      </ProductPage>
    </Frame>
  );
}

/** Why a route didn't load, in one sentence: offline, or on our side. */
export function routeErrorLine(online: boolean): string {
  return online
    ? "Something went wrong on our side. Try again, and if it keeps happening, send us feedback."
    : "You're offline. Try again once you're connected.";
}

/** A route that threw: the bar, what happened and Try again. Never red. */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  const isPage = useIsPage();
  const online = typeof navigator === "undefined" || navigator.onLine;
  const retry = () => {
    // Run the loaders again, then show the route in place of this.
    void router.invalidate().then(reset);
  };
  if (!isPage)
    return (
      <InlineError
        className="px-4"
        message={`This didn't load. ${routeErrorLine(online)}`}
        onRetry={retry}
      />
    );
  return (
    <Frame>
      <ProductPage width="note">
        <PageHeader
          title="This page didn't load"
          status={routeErrorLine(online)}
        />
        <div>
          <WithTooltip label="Load this page again">
            <Button onClick={retry}>Try again</Button>
          </WithTooltip>
        </div>
      </ProductPage>
    </Frame>
  );
}
