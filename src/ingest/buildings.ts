import { z } from "zod";
import {
  type Building,
  BuildingCodeSchema,
  BuildingSchema,
  BuildingsFileSchema,
  buildingsKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  JOBS_PREFIX,
  OffCampusSchema,
  SCHEMA_VERSIONS,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import seed from "./buildings-seed.json";
import { BUILDING_ROOMS_KEY, BuildingRoomsSchema } from "./catalog";
import type { HttpClient } from "./http";
import {
  type Logger,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";
import { fetchBuildingPopup } from "./soc/client";

// Buildings (DATA.md §4.4): the checked-in seed (every code seen on
// 2026-09-25, joined through Testudo's building popup to UMD's ArcGIS layer)
// plus codes the catalog has seen since, looked up the same way.

export const ARCGIS_BUILDINGS_URL =
  "https://services9.arcgis.com/1rOwFRpAwrxe0rBl/arcgis/rest/services/BuildingAllSearch/FeatureServer/0/query?where=1%3D1&outFields=BUILDINGID,NAME,POINT_X,POINT_Y&returnGeometry=false&f=json";

const SeedSchema = z.object({
  buildings: z.array(BuildingSchema),
  offCampus: z.array(OffCampusSchema),
  /** Codes that don't join and aren't off campus (TBA, unknown), with why. */
  unresolved: z.record(z.string(), z.string()),
});

export const BUILDINGS_SEED = SeedSchema.parse(seed);

const DISCOVERED_KEY = `${JOBS_PREFIX}buildings/discovered.json`;
const DiscoveredSchema = z.object({
  codes: z.record(
    z.string(),
    z.object({
      building: BuildingSchema.nullable(),
      /** Why it didn't join, when it didn't. */
      reason: z.string().nullable(),
      checkedAt: z.string(),
    }),
  ),
});
type Discovered = z.infer<typeof DiscoveredSchema>;

/** Codes that failed to join are retried after this long. */
const RETRY_MS = 30 * 24 * 3600 * 1000;

const ArcGisSchema = z.object({
  features: z.array(
    z.object({
      attributes: z.object({
        BUILDINGID: z.string().nullable(),
        NAME: z.string().nullable(),
        POINT_X: z.number().nullable(),
        POINT_Y: z.number().nullable(),
      }),
    }),
  ),
});

export interface BuildingsOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
}

export interface BuildingsResult {
  buildings: number;
  looked: number;
  joined: number;
  unjoined: string[];
  written: boolean;
}

export async function runBuildings(
  options: BuildingsOptions,
): Promise<BuildingsResult> {
  const { http, store, now, log } = options;
  const known = new Map(BUILDINGS_SEED.buildings.map((b) => [b.code, b]));
  const offCampus = new Set(BUILDINGS_SEED.offCampus.map((o) => o.code));
  const rooms = await readJsonOrNull(
    store,
    BUILDING_ROOMS_KEY,
    BuildingRoomsSchema,
    log,
  );
  const discovered: Discovered = (await readJsonOrNull(
    store,
    DISCOVERED_KEY,
    DiscoveredSchema,
    log,
  )) ?? { codes: {} };

  const due = Object.entries(rooms?.codes ?? {}).filter(([code]) => {
    if (
      known.has(code) ||
      offCampus.has(code) ||
      code in BUILDINGS_SEED.unresolved
    )
      return false;
    if (!BuildingCodeSchema.safeParse(code).success) return false;
    const prior = discovered.codes[code];
    return (
      !prior ||
      (!prior.building &&
        now.getTime() - Date.parse(prior.checkedAt) > RETRY_MS)
    );
  });

  let joined = 0;
  if (due.length > 0) {
    const layer = ArcGisSchema.parse(await http.json(ARCGIS_BUILDINGS_URL));
    const byNumber = new Map(
      layer.features.map((f) => [f.attributes.BUILDINGID ?? "", f.attributes]),
    );
    for (const [code, { room }] of due) {
      const at = now.toISOString();
      const popup = room ? await fetchBuildingPopup(http, code, room) : null;
      const arc = popup ? byNumber.get(popup.number) : undefined;
      const candidate =
        popup && arc && arc.POINT_X !== null && arc.POINT_Y !== null
          ? {
              code,
              number: popup.number,
              name: (arc.NAME ?? popup.name).trim() || popup.name,
              lat: Math.round(arc.POINT_Y * 1e6) / 1e6,
              lng: Math.round(arc.POINT_X * 1e6) / 1e6,
            }
          : null;
      const building =
        candidate && BuildingSchema.safeParse(candidate).success
          ? candidate
          : null;
      discovered.codes[code] = {
        building,
        reason: building
          ? null
          : !room
            ? "no room seen to look it up with"
            : !popup
              ? "Testudo's building popup doesn't know it"
              : `building number ${popup.number} isn't in UMD's map layer`,
        checkedAt: at,
      };
      if (building) joined++;
    }
    await writeJson(store, DISCOVERED_KEY, discovered);
  }

  for (const entry of Object.values(discovered.codes)) {
    if (entry.building && !known.has(entry.building.code)) {
      known.set(entry.building.code, entry.building);
    }
  }
  const buildings: Building[] = [...known.values()].sort((a, b) =>
    a.code < b.code ? -1 : 1,
  );
  const previous = await readJsonOrNull(
    store,
    GEO_MANIFEST_KEY,
    GeoManifestSchema,
    log,
  );
  const out = await writeHashed(
    store,
    BuildingsFileSchema,
    {
      schemaVersion: SCHEMA_VERSIONS.geo,
      buildings,
      offCampus: BUILDINGS_SEED.offCampus,
    },
    buildingsKey,
    "buildings",
    previous?.buildings.hash ?? null,
  );
  await updatePointer(
    store,
    GEO_MANIFEST_KEY,
    GeoManifestSchema,
    (current) => ({
      schemaVersion: SCHEMA_VERSIONS.geo,
      generatedAt: now.toISOString(),
      buildings: { hash: out.hash, count: buildings.length },
      routes: current?.routes ?? null,
    }),
  );
  return {
    buildings: buildings.length,
    looked: due.length,
    joined,
    unjoined: Object.entries(discovered.codes)
      .filter(([, v]) => !v.building)
      .map(([code, v]) => `${code}: ${v.reason}`),
    written: out.written,
  };
}
