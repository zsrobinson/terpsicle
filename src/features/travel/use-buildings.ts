import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Building, BuildingCode } from "~/core/schema";
import { buildingsQuery, geoManifestQuery } from "~/state/query/catalog";
import { usePublishedSource } from "~/state/query/published";

// Building names for connection details ("Leave Brendan Iribe Center"):
// the campus map's buildings file (the same query the travel math reads),
// loaded when a connection's details open.

type Buildings = ReadonlyMap<BuildingCode, Building>;

/** Every campus building by code; empty until the buildings file loads. */
export function useBuildings(): Buildings {
  const source = usePublishedSource((s) => s.source);
  const manifest = useQuery(geoManifestQuery(source));
  const file = useQuery(buildingsQuery(source, manifest.data));
  return useMemo(
    () =>
      file.data
        ? new Map(file.data.buildings.map((b) => [b.code, b]))
        : NO_BUILDINGS,
    [file.data],
  );
}
const NO_BUILDINGS: Buildings = new Map();
