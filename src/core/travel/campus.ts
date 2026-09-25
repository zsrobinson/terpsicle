import type { BuildingCode, BuildingsFile } from "../schema";
import type { RouteTable } from "./routes-binary";

// What travel needs to know about places: walking distances, and which
// building codes are off the College Park campus (DATA §4.4).

export type CampusMap = {
  /** null until the routes file loads: every connection is then `unknown`. */
  readonly routes: RouteTable | null;
  /** Off-campus codes (Shady Grove, DC): meetings there never form a connection. */
  readonly offCampus: ReadonlySet<BuildingCode>;
};

/** Before any geo data loads. */
export const EMPTY_CAMPUS: CampusMap = { routes: null, offCampus: new Set() };

export function campusMap(
  routes: RouteTable | null,
  buildings: Pick<BuildingsFile, "offCampus"> | null,
): CampusMap {
  return {
    routes,
    offCampus: new Set(buildings?.offCampus.map((b) => b.code) ?? []),
  };
}
