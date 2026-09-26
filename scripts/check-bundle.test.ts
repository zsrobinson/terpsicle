import { describe, expect, it } from "vitest";
import type { BundleGraph } from "./bundle-graph";
import {
  eagerChunks,
  forbiddenModules,
  forbiddenText,
  linkedCss,
} from "./check-bundle";

const chunk = (
  imports: string[],
  modules: string[],
  dynamicImports: string[] = [],
) => ({ isEntry: false, imports, dynamicImports, css: [], modules });

const graph: BundleGraph = {
  "assets/index.js": {
    ...chunk(["assets/ui.js"], ["src/app/app.tsx"], ["assets/routes.js"]),
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
