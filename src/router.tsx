import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// TanStack Start calls this on the server and in the browser.
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
