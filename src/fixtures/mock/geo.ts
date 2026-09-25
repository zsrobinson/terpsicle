// Mock geo data: real buildings (the recon's code map), real distances and
// route polylines where the recon captured UMD GIS answers, and estimates for
// every other pair. Estimates are straight-line distance between centroids ×
// 1.05, the median real/straight ratio over the 21 measured pairs; accessible
// estimates add the measured median of 8.5%.
import { z } from "zod";
import {
  BuildingSchema,
  type BuildingsFile,
  OffCampusSchema,
  ROUTES_BINARY_VERSION,
  ROUTES_HEADER_BYTES,
  ROUTES_MAGIC,
  ROUTES_MAX_FEET,
  ROUTES_NO_ROUTE,
  ROUTES_UNKNOWN,
  type RouteGeometry,
  type RoutesIndex,
  TRAVEL_MODES,
  type TravelMode,
} from "~/core/schema";
import geoJson from "./derived/geo.json";

const DerivedGeoSchema = z.object({
  fetchedAt: z.string(),
  buildings: z.array(BuildingSchema),
  offCampus: z.array(OffCampusSchema),
  distances: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      mode: z.enum(TRAVEL_MODES),
      /** null: UMD GIS answered "No solution found". */
      feet: z.number().int().nullable(),
    }),
  ),
  geometries: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      mode: z.enum(TRAVEL_MODES),
      lengthFeet: z.number().int(),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
  ),
});

const derived = DerivedGeoSchema.parse(geoJson);

/** Detour factor for estimated pairs (see the file comment). */
export const ESTIMATE_DETOUR = 1.05;
/** Accessible-over-standard ratio for estimated pairs. */
export const ESTIMATE_ACCESSIBLE_RATIO = 1.085;
/** Buildings UMD's accessible network can't route to at all (RESEARCH §5.0). */
export const NO_ACCESSIBLE_ROUTE: ReadonlySet<string> = new Set([
  "IPT",
  "PBR",
  "GVC",
]);

export const mockBuildingsFile: BuildingsFile = {
  schemaVersion: 1,
  buildings: derived.buildings,
  offCampus: derived.offCampus,
};

const byCode = new Map(derived.buildings.map((b) => [b.code, b]));

const pairKey = (a: string, b: string, mode: TravelMode) =>
  a < b ? `${a}|${b}|${mode}` : `${b}|${a}|${mode}`;

// Distances are symmetric on every pair measured (RESEARCH §5.0), so one entry serves both ways.
const real = new Map(
  derived.distances.map((d) => [pairKey(d.from, d.to, d.mode), d.feet]),
);

function straightLineFeet(a: string, b: string): number | null {
  const A = byCode.get(a);
  const B = byCode.get(b);
  if (!A || !B) return null;
  const rad = Math.PI / 180;
  const earthFeet = 6_371_008.8 * 3.28084;
  const h =
    Math.sin(((B.lat - A.lat) * rad) / 2) ** 2 +
    Math.cos(A.lat * rad) *
      Math.cos(B.lat * rad) *
      Math.sin(((B.lng - A.lng) * rad) / 2) ** 2;
  return 2 * earthFeet * Math.asin(Math.sqrt(h));
}

/**
 * Walking feet between two buildings: a number, "no-route" when UMD's network
 * has none, or null when either code isn't a mock building.
 */
export function mockDistanceFeet(
  from: string,
  to: string,
  mode: TravelMode,
): number | "no-route" | null {
  if (!byCode.has(from) || !byCode.has(to)) return null;
  if (from === to) return 0;
  const measured = real.get(pairKey(from, to, mode));
  if (measured !== undefined) return measured ?? "no-route";
  if (
    mode === "accessible" &&
    (NO_ACCESSIBLE_ROUTE.has(from) || NO_ACCESSIBLE_ROUTE.has(to))
  )
    return "no-route";
  const standard = real.get(pairKey(from, to, "standard")) ?? null;
  const base =
    standard ?? Math.round((straightLineFeet(from, to) ?? 0) * ESTIMATE_DETOUR);
  return mode === "standard"
    ? base
    : Math.round(base * ESTIMATE_ACCESSIBLE_RATIO);
}

export const mockRoutesIndex: RoutesIndex = {
  buildings: derived.buildings.map((b) => b.code),
  modes: ["standard", "accessible"],
};

/** The routes binary (docs/DATA.md §4.2) for every mock building pair. */
export function encodeMockRoutes(): Uint8Array<ArrayBuffer> {
  const index = new TextEncoder().encode(JSON.stringify(mockRoutesIndex));
  const n = mockRoutesIndex.buildings.length;
  const m = TRAVEL_MODES.length;
  const padding = (4 - ((ROUTES_HEADER_BYTES + index.length) % 4)) % 4;
  const dataStart = ROUTES_HEADER_BYTES + index.length + padding;
  const bytes = new Uint8Array(dataStart + 2 * m * n * n);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = ROUTES_MAGIC.charCodeAt(i);
  view.setUint16(4, ROUTES_BINARY_VERSION, true);
  view.setUint16(6, n, true);
  view.setUint8(8, m);
  view.setUint32(12, index.length, true);
  bytes.set(index, ROUTES_HEADER_BYTES);
  TRAVEL_MODES.forEach((mode, mi) => {
    mockRoutesIndex.buildings.forEach((from, i) => {
      mockRoutesIndex.buildings.forEach((to, j) => {
        const feet = mockDistanceFeet(from, to, mode);
        const cell =
          feet === null
            ? ROUTES_UNKNOWN
            : feet === "no-route"
              ? ROUTES_NO_ROUTE
              : Math.min(feet, ROUTES_MAX_FEET);
        view.setUint16(dataStart + 2 * (mi * n * n + i * n + j), cell, true);
      });
    });
  });
  return bytes;
}

/**
 * Real route polylines (UMD GIS, captured by the recon), in both directions:
 * VMH to 20 buildings, IRB–CSI and VMH–EGR in both modes, IPT–MTH standard.
 */
export const mockRouteGeometries: readonly RouteGeometry[] =
  derived.geometries.flatMap((g) => {
    const base = {
      schemaVersion: 1 as const,
      mode: g.mode,
      lengthFeet: g.lengthFeet,
      source: "umd-gis" as const,
      fetchedAt: derived.fetchedAt,
    };
    return [
      { ...base, from: g.from, to: g.to, coordinates: g.coordinates },
      {
        ...base,
        from: g.to,
        to: g.from,
        coordinates: [...g.coordinates].reverse(),
      },
    ];
  });
