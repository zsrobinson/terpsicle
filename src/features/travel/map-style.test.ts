import { describe, expect, it } from "vitest";
import { boundsOf, pathData, projectToBox } from "./geo";
import { type MapColors, mix, quietFlavor, routeMapStyle } from "./map-style";

const LIGHT: MapColors = {
  panel: "#f7f7f9",
  raised: "#ffffff",
  hover: "#efeff2",
  hairline: "#e6e6ea",
  hairlineStrong: "#d4d4da",
  fg: "#18181b",
};

// A few points of the real IRB → CSI route (UMD GIS, in the fixtures).
const ROUTE: [number, number][] = [
  [-76.936, 38.989],
  [-76.9365, 38.9895],
  [-76.9368, 38.9901],
];

describe("route map style", () => {
  it("mixes hex colors", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#f7f7f9", "#f7f7f9", 0.3)).toBe("#f7f7f9");
    expect(mix("rgb(0 0 0)", "#ffffff", 0.5)).toBe("rgb(0 0 0)");
  });

  it("draws land, buildings and paths in the app's tokens", () => {
    const flavor = quietFlavor(false, LIGHT);
    expect(flavor.earth).toBe(LIGHT.panel);
    expect(flavor.background).toBe(LIGHT.panel);
    expect(flavor.buildings).toBe(LIGHT.hairline);
    expect(flavor.other).toBe(LIGHT.hairlineStrong);
    expect(flavor.major).toBe(LIGHT.raised);
  });

  it("reads tiles over pmtiles, draws the route on top, and needs no glyphs", () => {
    const style = routeMapStyle({
      tilesUrl: "https://terpsicle.com/data/geo/tiles.pmtiles",
      route: { coordinates: ROUTE },
      dark: false,
      colors: LIGHT,
    });
    expect(style.sources.campus).toMatchObject({
      type: "vector",
      url: "pmtiles://https://terpsicle.com/data/geo/tiles.pmtiles",
    });
    expect(JSON.stringify(style.sources.campus)).toContain("OpenStreetMap");
    const ids = style.layers.map((l) => l.id);
    expect(ids.slice(-3)).toEqual(["route-halo", "route-line", "route-ends"]);
    expect(style.layers.some((l) => l.type === "symbol")).toBe(false);
    expect(style.glyphs).toBeUndefined();
    const route = style.sources.route;
    if (route?.type !== "geojson") throw new Error("no route source");
    expect(JSON.stringify(route.data)).toContain(JSON.stringify(ROUTE));
  });
});

describe("projectToBox", () => {
  it("keeps every point inside the padding, in true proportion", () => {
    const { points } = projectToBox(ROUTE, 320, 200, 30);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(x).toBeLessThanOrEqual(290 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(30 - 1e-9);
      expect(y).toBeLessThanOrEqual(170 + 1e-9);
    }
    // North is up: the last point (furthest north) is highest.
    const [first, , last] = points;
    expect(last?.[1]).toBeLessThan(first?.[1] ?? 0);
    // The route's height fills the box (it's taller than it is wide here).
    expect(Math.abs((first?.[1] ?? 0) - (last?.[1] ?? 0))).toBeCloseTo(140);
  });

  it("writes an SVG path through the points", () => {
    expect(
      pathData([
        [1, 2],
        [3.26, 4],
      ]),
    ).toBe("M1.0 2.0 L3.3 4.0");
    expect(boundsOf(ROUTE)).toEqual({
      west: -76.9368,
      south: 38.989,
      east: -76.936,
      north: 38.9901,
    });
  });
});
