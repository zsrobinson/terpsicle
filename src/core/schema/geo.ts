import { z } from "zod";
import {
  BuildingCodeSchema,
  ContentHashSchema,
  IsoDateTimeSchema,
} from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// Buildings, walking distances and route geometry (docs/DATA.md §4.2–4.4).

const geoVersion = z.literal(SCHEMA_VERSIONS.geo);

export const TravelModeSchema = z.enum(["standard", "accessible"]);
export type TravelMode = z.infer<typeof TravelModeSchema>;

/** Matrix order inside the routes binary. */
export const TRAVEL_MODES = [
  "standard",
  "accessible",
] as const satisfies readonly TravelMode[];

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const BuildingSchema = z.object({
  code: BuildingCodeSchema,
  /**
   * UMD building number from Testudo's building popup: a zero-padded string
   * ("039", "432"), the join key to UMD map data. Never parse it as an int.
   */
  number: z
    .string()
    .regex(/^\d{3}$/, "Expected a zero-padded building number like 039"),
  /** UMD's long name: "Brendan Iribe Center for Computer Science and Engineering". */
  name: z.string().min(1).max(200),
  /** A point inside the footprint, WGS84. */
  lat: latitude,
  lng: longitude,
});
export type Building = z.infer<typeof BuildingSchema>;

/** A Testudo code for a place off the College Park campus (Shady Grove, DC, Baltimore). */
export const OffCampusSchema = z.object({
  code: BuildingCodeSchema,
  /** "Universities at Shady Grove, Building IV". */
  name: z.string().min(1).max(200),
});
export type OffCampus = z.infer<typeof OffCampusSchema>;

/** `geo/buildings.<hash>.json`: every building code seen in any term that joined to map data. */
export const BuildingsFileSchema = z.object({
  schemaVersion: geoVersion,
  /** Sorted by code, unique. */
  buildings: z.array(BuildingSchema),
  /**
   * Known off-campus codes, sorted by code. Meetings there never form a
   * connection (no travel pill). Codes in neither list are unknown: their
   * connections get the `unknown` verdict.
   */
  offCampus: z.array(OffCampusSchema),
});
export type BuildingsFile = z.infer<typeof BuildingsFileSchema>;

// ---------- routes binary (distances) ----------

/** First four bytes of `geo/routes.<hash>.bin`, ASCII. */
export const ROUTES_MAGIC = "TRPR";
/** Fixed header length in bytes, before the JSON index. */
export const ROUTES_HEADER_BYTES = 16;
/** Distance cell meaning "not computed yet" (a new building, or the job hasn't reached it). */
export const ROUTES_UNKNOWN = 0xffff;
/**
 * Distance cell meaning "UMD's network has no route": the solver answered "No
 * solution found". Common in accessible mode (IPT, PBR and GVC have none).
 */
export const ROUTES_NO_ROUTE = 0xfffe;
/** Largest storable distance, in feet (~12.4 miles). */
export const ROUTES_MAX_FEET = 0xfffd;

/**
 * The UTF-8 JSON index embedded after the fixed header. Row/column `i` of every
 * matrix is `buildings[i]`; matrix `m` is `modes[m]`.
 */
export const RoutesIndexSchema = z.object({
  /** Sorted by code, unique. */
  buildings: z.array(BuildingCodeSchema).max(0xffff),
  modes: z.tuple([z.literal("standard"), z.literal("accessible")]),
});
export type RoutesIndex = z.infer<typeof RoutesIndexSchema>;

// ---------- route geometry ----------

/** `[lng, lat]`, GeoJSON order, WGS84, 6 decimal places. */
export const LngLatSchema = z.tuple([longitude, latitude]);
export type LngLat = z.infer<typeof LngLatSchema>;

/** `geo/route/<from>-<to>-<mode>.json`: the real path, fetched only when a connection's map opens. */
export const RouteGeometrySchema = z.object({
  schemaVersion: geoVersion,
  from: BuildingCodeSchema,
  to: BuildingCodeSchema,
  mode: TravelModeSchema,
  /** Equals the distance in the routes binary for this pair and mode. */
  lengthFeet: z.number().int().min(0).max(ROUTES_MAX_FEET),
  /** From an entrance of `from` to an entrance of `to`. */
  coordinates: z.array(LngLatSchema).min(2),
  /** Only UMD's network produces geometry; OSRM fallbacks are distance-only. */
  source: z.literal("umd-gis"),
  fetchedAt: IsoDateTimeSchema,
});
export type RouteGeometry = z.infer<typeof RouteGeometrySchema>;

// ---------- geo manifest ----------

/** `geo/manifest.json`. */
export const GeoManifestSchema = z.object({
  schemaVersion: geoVersion,
  generatedAt: IsoDateTimeSchema,
  buildings: z.object({
    hash: ContentHashSchema,
    count: z.number().int().min(0),
  }),
  /** null until the first routes run completes a file. */
  routes: z
    .object({
      hash: ContentHashSchema,
      buildingCount: z.number().int().min(0),
      /** Directed pairs with a known distance, per mode. */
      knownPairs: z.object({
        standard: z.number().int().min(0),
        accessible: z.number().int().min(0),
      }),
      builtAt: IsoDateTimeSchema,
    })
    .nullable(),
});
export type GeoManifest = z.infer<typeof GeoManifestSchema>;
