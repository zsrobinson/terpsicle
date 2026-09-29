import { describe, expect, it } from "vitest";
import type { BundleGraph } from "./bundle-graph";
import {
  eagerChunks,
  forbiddenModules,
  forbiddenText,
  linkedCss,
  MARKETING_NEVER_EAGER,
  SCHEDULE_NEVER_EAGER,
} from "./check-bundle";

const chunk = (
  imports: string[],
  modules: string[],
  dynamicImports: string[] = [],
) => ({ isEntry: false, imports, dynamicImports, css: [], modules });

const graph: BundleGraph = {
  "assets/index.js": {
    ...chunk(
      ["assets/ui.js"],
      ["src/features/schedule/app.tsx"],
      ["assets/routes.js"],
    ),
    isEntry: true,
  },
  "assets/ui.js": chunk([], ["src/components/ui/button.tsx"]),
  "assets/routes.js": chunk(
    ["assets/ui.js"],
    ["src/features/generate/results.tsx"],
    ["assets/map.js", "assets/fixtures.js"],
  ),
  "assets/map.js": chunk(
    ["assets/routes.js"],
    [
      "node_modules/.pnpm/maplibre-gl@5.1.0/node_modules/maplibre-gl/dist/maplibre-gl.js",
    ],
  ),
  "assets/fixtures.js": chunk([], ["src/fixtures/mock/catalog.ts"]),
};

describe("bundle check", () => {
  it("follows static imports only", () => {
    expect(eagerChunks(graph, ["assets/index.js"])).toEqual([
      "assets/index.js",
      "assets/ui.js",
    ]);
    expect(eagerChunks(graph, ["assets/index.js", "assets/routes.js"])).toEqual(
      ["assets/index.js", "assets/routes.js", "assets/ui.js"],
    );
  });

  it("flags MapLibre, the generator and fixtures in eager chunks", () => {
    expect(
      forbiddenModules(graph, ["assets/index.js", "assets/routes.js"]),
    ).toEqual([]);
    expect(
      forbiddenModules(graph, ["assets/map.js", "assets/fixtures.js"]),
    ).toEqual([
      "assets/map.js: node_modules/.pnpm/maplibre-gl@5.1.0/node_modules/maplibre-gl/dist/maplibre-gl.js (MapLibre loads with the route map)",
      "assets/fixtures.js: src/fixtures/mock/catalog.ts (fixtures are for mock mode only)",
    ]);
    const worker: BundleGraph = {
      "assets/r.js": chunk(
        [],
        ["src/worker/generate-job.ts", "src/core/generate/solve.ts"],
      ),
    };
    expect(forbiddenModules(worker, ["assets/r.js"])).toHaveLength(2);
  });

  it("keeps the scheduler's lazy tabs, drawer and search index out of its first load", () => {
    // Base UI's Drawer, as pnpm lays it out: only the sheet indent's parts
    // may be eager.
    const BASE_UI =
      "node_modules/.pnpm/@base-ui+react@1.8.0/node_modules/@base-ui/react";
    const eager: BundleGraph = {
      "assets/s.js": chunk(
        [],
        [
          "src/routes/schedule.generate.tsx",
          "src/routes/schedule.travel.tsx",
          "src/features/search/search-panel.tsx",
          "src/core/search/filters.ts",
          "src/lib/drawer-heights.ts",
          "src/features/generate/generate-panel.tsx",
          "src/features/register/register-panel.tsx",
          "src/core/ics/ics.ts",
          "src/core/search/search.ts",
          `${BASE_UI}/drawer/viewport/DrawerViewport.mjs`,
          `${BASE_UI}/drawer/provider/DrawerProvider.mjs`,
          `${BASE_UI}/drawer/indent/DrawerIndent.mjs`,
          "src/components/ui/sheet-indent.tsx",
          "src/features/schedule/mobile-drawer.tsx",
          "src/components/workbench/drawer.tsx",
        ],
      ),
    };
    expect(
      forbiddenModules(eager, ["assets/s.js"], SCHEDULE_NEVER_EAGER).map(
        (p) => p.split(" (")[0],
      ),
    ).toEqual([
      "assets/s.js: src/features/generate/generate-panel.tsx",
      "assets/s.js: src/features/register/register-panel.tsx",
      "assets/s.js: src/core/ics/ics.ts",
      "assets/s.js: src/core/search/search.ts",
      `assets/s.js: ${BASE_UI}/drawer/viewport/DrawerViewport.mjs`,
      "assets/s.js: src/features/schedule/mobile-drawer.tsx",
      "assets/s.js: src/components/workbench/drawer.tsx",
    ]);
  });

  it("keeps the app's frame, menus, tooltips and toasts out of the marketing page's first load", () => {
    const base = "node_modules/.pnpm/x/node_modules";
    const eager: BundleGraph = {
      "assets/m.js": chunk(
        [],
        [
          // What `/` carries: its page, the account's status, the chip, the
          // tooltips' shared delay, and the query client.
          "src/features/marketing/frame.tsx",
          "src/components/lazy-tooltip.tsx",
          "src/features/auth/account-store.ts",
          "src/components/early-access.tsx",
          "src/components/ui/tooltip-provider.tsx",
          `${base}/@base-ui/react/tooltip/provider/TooltipProvider.mjs`,
          `${base}/@tanstack/query-core/build/modern/queryClient.js`,
          // What it loads on first use.
          "src/components/app-bar.tsx",
          "src/features/site/route-states.tsx",
          "src/features/site/not-found-page.tsx",
          "src/features/notifications/bell.tsx",
          "src/features/auth/account-button.tsx",
          "src/components/ui/tooltip.tsx",
          `${base}/@base-ui/react/tooltip/root/TooltipRoot.mjs`,
          `${base}/@floating-ui/dom/dist/floating-ui.dom.mjs`,
          `${base}/sonner/dist/index.mjs`,
          `${base}/@tanstack/query-core/build/modern/queryObserver.js`,
        ],
      ),
    };
    expect(
      forbiddenModules(eager, ["assets/m.js"], MARKETING_NEVER_EAGER).map((p) =>
        p.split(" (")[0]?.replace(`${base}/`, ""),
      ),
    ).toEqual([
      "assets/m.js: src/components/app-bar.tsx",
      "assets/m.js: src/features/site/route-states.tsx",
      "assets/m.js: src/features/site/not-found-page.tsx",
      "assets/m.js: src/features/notifications/bell.tsx",
      "assets/m.js: src/features/auth/account-button.tsx",
      "assets/m.js: src/components/ui/tooltip.tsx",
      "assets/m.js: @base-ui/react/tooltip/root/TooltipRoot.mjs",
      "assets/m.js: @floating-ui/dom/dist/floating-ui.dom.mjs",
      "assets/m.js: sonner/dist/index.mjs",
      "assets/m.js: @tanstack/query-core/build/modern/queryObserver.js",
    ]);
  });

  it("finds stylesheets linked from the document head", () => {
    expect(
      linkedCss(
        'var tl=`/assets/styles-OUuNVhgb.css`,x=["assets/live-route-map-B8.css"]',
      ),
    ).toEqual(["assets/styles-OUuNVhgb.css"]);
  });
});

describe("text kept out of the build", () => {
  it("names each file that holds the contact address", () => {
    const address = ["admin", "terpsicle.com"].join("@");
    expect(
      forbiddenText([
        { file: "dist/client/assets/a.js", text: `x="mailto:${address}"` },
        { file: "dist/client/assets/b.js", text: "admin [at] terpsicle.com" },
      ]),
    ).toEqual([`dist/client/assets/a.js: contains "${address}"`]);
  });
});
