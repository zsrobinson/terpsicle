import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";
import type { RouteGeometry } from "~/core/schema";

// The campus map's style: Protomaps' basemap layers (OpenStreetMap data) in
// the app's own neutral tokens, so the map reads as part of the panel and the
// route is the only thing with contrast. No labels: they'd need glyph files,
// and the route's two buildings are labeled on top of the map.

/** The theme tokens the map is drawn in (src/styles.css), as resolved colors. */
export type MapColors = {
  readonly panel: string;
  readonly raised: string;
  readonly hover: string;
  readonly hairline: string;
  readonly hairlineStrong: string;
  readonly fg: string;
};

const TOKEN_NAMES = {
  panel: "--panel",
  raised: "--raised",
  hover: "--hover",
  hairline: "--hairline",
  hairlineStrong: "--hairline-strong",
  fg: "--fg",
} as const satisfies Record<keyof MapColors, `--${string}`>;

/** Reads the tokens as the page has them now (they change with the theme). */
export function readMapColors(root: HTMLElement): MapColors {
  const style = getComputedStyle(root);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    panel: read(TOKEN_NAMES.panel),
    raised: read(TOKEN_NAMES.raised),
    hover: read(TOKEN_NAMES.hover),
    hairline: read(TOKEN_NAMES.hairline),
    hairlineStrong: read(TOKEN_NAMES.hairlineStrong),
    fg: read(TOKEN_NAMES.fg),
  };
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** `a` moved `t` of the way to `b` (hex colors); `a` if either isn't hex. */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return `#${x
    .map((v, i) =>
      Math.round(v + ((y[i] ?? v) - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Protomaps' flavor with every color from the app's tokens: land is the
 * panel, buildings a hairline, streets the raised surface, and footpaths a
 * stronger hairline, since they're the network the route follows.
 */
export function quietFlavor(dark: boolean, c: MapColors): Flavor {
  const base = namedFlavor(dark ? "black" : "white");
  const land = c.panel;
  const green = mix(land, c.hover, dark ? 0.5 : 0.6);
  const water = mix(land, c.hairlineStrong, 0.7);
  const road = dark ? mix(c.raised, c.hover, 0.6) : c.raised;
  const flavor: Flavor = { ...base };
  for (const key of Object.keys(base) as (keyof Flavor)[]) {
    const value = base[key];
    if (typeof value !== "string" || key.includes("label")) continue;
    let color = land;
    if (key.includes("casing")) color = c.hairline;
    else if (key.startsWith("tunnel_")) color = mix(land, road, 0.5);
    else if (
      /^(bridges_)?(minor_service|minor_a|minor_b|link|major|highway|other|minor)$/.test(
        key,
      )
    )
      color = road;
    Object.assign(flavor, { [key]: color });
  }
  return {
    ...flavor,
    background: land,
    earth: land,
    // The whole campus is school land: keep it the same as the land around.
    school: land,
    park_a: green,
    park_b: green,
    wood_a: green,
    wood_b: green,
    scrub_a: green,
    scrub_b: green,
    pedestrian: mix(land, c.hover, 0.4),
    water,
    buildings: c.hairline,
    other: c.hairlineStrong,
    bridges_other: c.hairlineStrong,
    tunnel_other: mix(land, c.hairlineStrong, 0.5),
    railway: c.hairlineStrong,
    boundaries: c.hairlineStrong,
    runway: c.hairline,
    pier: c.hairline,
    landcover: {
      barren: land,
      farmland: land,
      forest: green,
      glacier: land,
      grassland: green,
      scrub: green,
      urban_area: land,
    },
  };
}

export const MAP_ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

/** The whole style: basemap, then the route and its two ends on top. */
export function routeMapStyle({
  tilesUrl,
  route,
  dark,
  colors,
}: {
  /** An absolute URL to `geo/tiles.pmtiles`. */
  tilesUrl: string;
  route: Pick<RouteGeometry, "coordinates">;
  dark: boolean;
  colors: MapColors;
}): StyleSpecification {
  const coordinates = route.coordinates.map(([lng, lat]) => [lng, lat]);
  const start = coordinates[0];
  const end = coordinates.at(-1);
  const halo = colors.panel;
  return {
    version: 8,
    sources: {
      campus: {
        type: "vector",
        url: `pmtiles://${tilesUrl}`,
        attribution: MAP_ATTRIBUTION,
      },
      route: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { part: "path" },
              geometry: { type: "LineString", coordinates },
            },
            ...[start, end].flatMap((point, i) =>
              point
                ? [
                    {
                      type: "Feature" as const,
                      properties: { part: i === 0 ? "start" : "end" },
                      geometry: { type: "Point" as const, coordinates: point },
                    },
                  ]
                : [],
            ),
          ],
        },
      },
    },
    layers: [
      ...layers("campus", quietFlavor(dark, colors)),
      {
        id: "route-halo",
        type: "line",
        source: "route",
        filter: ["==", ["get", "part"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": halo,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 6, 18, 11],
        },
      },
      {
        id: "route-line",
        type: "line",
        source: "route",
        filter: ["==", ["get", "part"], "path"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": colors.fg,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 5.5],
        },
      },
      {
        id: "route-ends",
        type: "circle",
        source: "route",
        filter: ["!=", ["get", "part"], "path"],
        paint: {
          "circle-radius": 5.5,
          "circle-color": [
            "case",
            ["==", ["get", "part"], "start"],
            colors.raised,
            colors.fg,
          ],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": [
            "case",
            ["==", ["get", "part"], "start"],
            colors.fg,
            colors.raised,
          ],
        },
      },
    ],
  };
}
