import { useEffect, useState } from "react";
import type { Building, BuildingCode } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import type { DataReader } from "~/state/data-source";

// Building names for connection details ("Leave Brendan Iribe Center"),
// read through the app's data reader only when a connection's details open.
// The catalog store keeps the campus map (routes, off-campus codes) but not
// the names.

type Buildings = ReadonlyMap<BuildingCode, Building>;

const buildingsByReader = new WeakMap<DataReader, Promise<Buildings>>();

function loadBuildings(reader: DataReader): Promise<Buildings> {
  let promise = buildingsByReader.get(reader);
  if (!promise) {
    promise = reader
      .geoManifest()
      .then((m) => reader.buildings(m.buildings.hash))
      .then((file) => new Map(file.buildings.map((b) => [b.code, b])));
    // A failed load can be retried the next time details open.
    promise.catch(() => buildingsByReader.delete(reader));
    buildingsByReader.set(reader, promise);
  }
  return promise;
}

/** Every campus building by code; empty until the buildings file loads. */
export function useBuildings(): Buildings {
  const reader = useCatalog((s) => s.reader);
  const [buildings, setBuildings] = useState<Buildings>(NO_BUILDINGS);
  useEffect(() => {
    if (!reader) return;
    let live = true;
    loadBuildings(reader).then(
      (b) => live && setBuildings(b),
      (error: unknown) => console.error(error),
    );
    return () => {
      live = false;
    };
  }, [reader]);
  return buildings;
}
const NO_BUILDINGS: Buildings = new Map();
