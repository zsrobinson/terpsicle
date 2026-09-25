import { useEffect, useState } from "react";
import type {
  Building,
  BuildingCode,
  RouteGeometry,
  TravelMode,
} from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import type { DataReader } from "~/state/data-source";

// Building names and route geometry for connection details. Both are read
// through the app's data reader, only when a connection's details open: most
// visits never need either.

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

/** `loading` until the file answers; `missing` when there's none (never draw a stand-in). */
export type RouteGeometryState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; route: RouteGeometry };

const routes = new Map<string, Promise<RouteGeometry | null>>();

function loadRoute(
  reader: DataReader,
  from: BuildingCode,
  to: BuildingCode,
  mode: TravelMode,
): Promise<RouteGeometry | null> {
  const key = `${reader.kind}:${from}-${to}-${mode}`;
  let promise = routes.get(key);
  if (!promise) {
    // Missing, unreachable or malformed all mean the same here: no map.
    promise = reader.routeGeometry(from, to, mode).catch((error: unknown) => {
      routes.delete(key);
      console.info(`No route geometry for ${from}-${to}-${mode}`, error);
      return null;
    });
    routes.set(key, promise);
  }
  return promise;
}

/** The path UMD's routing network found for this pair and mode. */
export function useRouteGeometry(
  from: BuildingCode,
  to: BuildingCode,
  mode: TravelMode,
): RouteGeometryState {
  const reader = useCatalog((s) => s.reader);
  const [state, setState] = useState<{
    key: string;
    value: RouteGeometryState;
  } | null>(null);
  const key = `${from}-${to}-${mode}`;
  useEffect(() => {
    if (!reader) return;
    let live = true;
    void loadRoute(reader, from, to, mode).then((route) => {
      if (!live) return;
      setState({
        key,
        value: route ? { status: "ready", route } : { status: "missing" },
      });
    });
    return () => {
      live = false;
    };
  }, [reader, from, to, mode, key]);
  // A result for another pair or mode is stale the moment the inputs change.
  return state?.key === key ? state.value : LOADING;
}
const LOADING: RouteGeometryState = { status: "loading" };
