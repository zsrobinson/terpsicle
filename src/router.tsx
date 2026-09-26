import { createRouter, stringifySearchWith } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// TanStack Start calls this on the server and in the browser.
export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Text as text: `?q=351`, not the default's `?q=%22351%22`
    // (it quotes any string that would parse as JSON). Parsing still reads
    // `351` as a number, so every search schema takes numbers back as
    // text (`~/core/schema/schedule-url`).
    stringifySearch: stringifySearchWith(JSON.stringify),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
