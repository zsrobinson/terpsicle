import { describe, expect, it } from "vitest";
import type { BundleGraph } from "./bundle-graph";
import { routeStatesFiles, shellFiles } from "./pwa-precache";

const chunk = (
  imports: string[],
  modules: string[],
  dynamicImports: string[] = [],
) => ({ isEntry: false, imports, dynamicImports, css: [], modules });

// A client build like the real one: the entry loads the route states, the
// toasts and the tooltips on demand, and the route map only on one page.
const graph: BundleGraph = {
  "assets/index.js": {
    ...chunk(
      ["assets/react.js"],
      ["src/router.tsx", "src/features/site/lazy-route-states.tsx"],
      [
        "assets/route-states.js",
        "assets/not-found-page.js",
        "assets/sonner.js",
        "assets/toast.js",
        "assets/tooltip.js",
        "assets/map.js",
      ],
    ),
    isEntry: true,
  },
  "assets/react.js": chunk([], ["node_modules/react/index.js"]),
  "assets/route-states.js": chunk(
    ["assets/app-bar.js", "assets/react.js"],
    ["src/features/site/route-states.tsx"],
  ),
  "assets/not-found-page.js": chunk(
    ["assets/app-bar.js"],
    ["src/features/site/not-found-page.tsx"],
  ),
  "assets/app-bar.js": chunk(
    ["assets/menu.js"],
    ["src/components/app-bar.tsx", "src/features/auth/account-button.tsx"],
  ),
  "assets/menu.js": chunk([], ["src/components/ui/dropdown-menu.tsx"]),
  "assets/sonner.js": chunk(
    [],
    ["src/components/ui/sonner.tsx", "node_modules/sonner/dist/index.mjs"],
  ),
  "assets/toast.js": chunk([], ["src/components/ui/toast.tsx"]),
  "assets/tooltip.js": chunk([], ["src/components/ui/tooltip.tsx"]),
  "assets/map.js": chunk([], ["src/features/travel/live-route-map.tsx"]),
  "assets/route-home.js": chunk(
    ["assets/react.js"],
    ["src/routes/home.tsx?tsr-split=component"],
  ),
};

describe("the service worker's precache", () => {
  it("keeps what every page loads on first use, for offline after a deploy", () => {
    const files = shellFiles(graph, () => "");
    for (const file of [
      "/assets/index.js",
      "/assets/route-home.js",
      // The router's states, with the family bar and its menus.
      "/assets/route-states.js",
      "/assets/not-found-page.js",
      "/assets/app-bar.js",
      "/assets/menu.js",
      // Undo toasts and tooltips.
      "/assets/sonner.js",
      "/assets/toast.js",
      "/assets/tooltip.js",
    ])
      expect(files).toContain(file);
  });

  it("leaves one page's lazy code to be cached when it's first used", () => {
    expect(shellFiles(graph, () => "")).not.toContain("/assets/map.js");
  });
});

describe("the route states' preload", () => {
  it("is their chunks and what they import, less what the entry loads", () => {
    expect(routeStatesFiles(graph)).toEqual([
      "/assets/app-bar.js",
      "/assets/menu.js",
      "/assets/not-found-page.js",
      "/assets/route-states.js",
    ]);
  });
});
