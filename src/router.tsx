import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { CSP_NONCE_HEADER } from "~/core/schema";
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
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    ...(nonce ? { ssr: { nonce } } : {}),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
