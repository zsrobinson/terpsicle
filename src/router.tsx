import { createRouter, stringifySearchWith } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { PageRequestContext } from "~/core/routing";
import { CSP_NONCE_HEADER } from "~/core/schema";
import {
  preloadRouteStates,
  routeStates,
} from "~/features/site/lazy-route-states";
import { createQueryClient } from "~/lib/query-client";
import {
  defaultViewTransition,
  settleViewTransitions,
} from "~/lib/view-transition";
import { routeTree } from "./routeTree.gen";

/**
 * The CSP nonce the Worker made for this response
 * (src/server/security/headers.ts). The server render puts it on
 * TanStack's own inline scripts, which carry per-request data and so can't
 * be hashed; the browser reads it back from the page's `csp-nonce` meta.
 */
const cspNonce = createIsomorphicFn()
  .server(() => getRequestHeader(CSP_NONCE_HEADER))
  .client((): string | undefined => undefined);

// TanStack Start calls this on the server and in the browser.
export function getRouter() {
  const nonce = cspNonce();
  // One per server render (never shared between requests) and one per page.
  const queryClient = createQueryClient();
  const { RoutePending, RouteError } = routeStates();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // One loading and one failure state for every route (docs/COHESION.md).
    defaultPendingComponent: RoutePending,
    defaultErrorComponent: RouteError,
    // The Worker renders the pending state for browser-only routes, and the
    // default 500ms minimum would hold it there after the page is ready.
    defaultPendingMinMs: 0,
    // Text as text: `?q=351`, not the default's `?q=%22351%22`
    // (it quotes any string that would parse as JSON). Parsing still reads
    // `351` as a number, so every search schema takes numbers back as
    // text (`~/core/schema/schedule-url`).
    stringifySearch: stringifySearchWith(JSON.stringify),
    // Push, pop, tab or none for each navigation, drawn by
    // src/styles/transitions.css (~/lib/view-transition).
    defaultViewTransition: defaultViewTransition(),
    ...(nonce ? { ssr: { nonce } } : {}),
  });
  // Streams what a server render's queries fetched into the page, hydrates
  // it in the browser, and wraps the app in QueryClientProvider.
  setupRouterSsrQueryIntegration({ router, queryClient });
  // Each transition's new page, once the router has rendered it.
  settleViewTransitions(router);
  if (!router.isServer) {
    // The loading and failure states load on their own (they carry the
    // family bar). A page the Worker drew as loading (`ssr: false`) needs
    // them to hydrate, so anywhere but `/` the head preloads their files
    // (src/routes/__root.tsx) and this takes them up now; on `/`, the
    // marketing page, which has its own frame, as soon as anything
    // navigates. The service worker keeps them for offline.
    if (window.location.pathname !== "/") void preloadRouteStates();
    router.subscribe("onBeforeNavigate", () => void preloadRouteStates());
  }
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
    // What the Worker passes each server render (src/server.ts): loaders
    // read it as `serverContext`, which is undefined in the browser.
    server: { requestContext: PageRequestContext };
  }
}
