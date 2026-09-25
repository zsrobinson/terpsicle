import {
  type BuildingCode,
  ROUTES_BINARY_VERSION,
  ROUTES_HEADER_BYTES,
  ROUTES_MAGIC,
  ROUTES_MAX_FEET,
  ROUTES_NO_ROUTE,
  ROUTES_UNKNOWN,
  RoutesIndexSchema,
  TRAVEL_MODES,
  type TravelMode,
} from "../schema";

// `geo/routes.<hash>.bin` (docs/DATA.md §4.2): a JSON index of buildings, then
// one N×N uint16 matrix of walking feet per travel mode, little-endian.

/** Decoded walking distances. Look up with `routeDistance`. */
export type RouteTable = {
  readonly buildings: readonly BuildingCode[];
  readonly buildingIndex: ReadonlyMap<BuildingCode, number>;
  readonly view: DataView;
  /** Byte offset of the first matrix inside `view`. */
  readonly dataOffset: number;
};

export class RoutesFormatError extends Error {
  override readonly name = "RoutesFormatError";
}

const MODE_COUNT = TRAVEL_MODES.length;

function padTo4(n: number): number {
  return (4 - (n % 4)) % 4;
}

/** Throws `RoutesFormatError` for anything that isn't exactly the documented layout. */
export function decodeRoutes(bytes: ArrayBuffer | Uint8Array): RouteTable {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.byteLength < ROUTES_HEADER_BYTES)
    throw new RoutesFormatError("Routes file is shorter than its header");
  const magic = String.fromCharCode(
    u8[0] ?? 0,
    u8[1] ?? 0,
    u8[2] ?? 0,
    u8[3] ?? 0,
  );
  if (magic !== ROUTES_MAGIC)
    throw new RoutesFormatError(`Bad magic "${magic}"`);
  const version = view.getUint16(4, true);
  if (version !== ROUTES_BINARY_VERSION)
    throw new RoutesFormatError(`Unsupported routes version ${version}`);
  const n = view.getUint16(6, true);
  const m = view.getUint8(8);
  if (m !== MODE_COUNT)
    throw new RoutesFormatError(`Expected ${MODE_COUNT} modes, got ${m}`);
  const indexLength = view.getUint32(12, true);
  const indexEnd = ROUTES_HEADER_BYTES + indexLength;
  const dataOffset = indexEnd + padTo4(indexEnd);
  const expected = dataOffset + 2 * m * n * n;
  if (u8.byteLength !== expected)
    throw new RoutesFormatError(
      `Routes file is ${u8.byteLength} bytes; expected ${expected}`,
    );

  let json: unknown;
  try {
    json = JSON.parse(
      new TextDecoder().decode(u8.subarray(ROUTES_HEADER_BYTES, indexEnd)),
    );
  } catch {
    throw new RoutesFormatError("Routes index isn't JSON");
  }
  const parsed = RoutesIndexSchema.safeParse(json);
  if (!parsed.success)
    throw new RoutesFormatError(
      `Routes index is invalid: ${parsed.error.message}`,
    );
  const { buildings } = parsed.data;
  if (buildings.length !== n)
    throw new RoutesFormatError(
      `Header says ${n} buildings; index lists ${buildings.length}`,
    );
  for (let i = 1; i < buildings.length; i++) {
    if ((buildings[i - 1] ?? "") >= (buildings[i] ?? ""))
      throw new RoutesFormatError(
        "Routes index buildings aren't sorted and unique",
      );
  }
  return {
    buildings,
    buildingIndex: new Map(buildings.map((b, i) => [b, i])),
    view,
    dataOffset,
  };
}

/**
 * Walking feet from one building to another, or why there's no number:
 * `"no-route"` when UMD's network can't route the pair in this mode, null
 * when it isn't computed yet or a building isn't in the file. The same
 * building is 0 feet.
 */
export type RouteDistance = number | "no-route" | null;

export function routeDistance(
  table: RouteTable,
  from: BuildingCode,
  to: BuildingCode,
  mode: TravelMode,
): RouteDistance {
  if (from === to) return 0;
  const i = table.buildingIndex.get(from);
  const j = table.buildingIndex.get(to);
  if (i === undefined || j === undefined) return null;
  const n = table.buildings.length;
  const m = TRAVEL_MODES.indexOf(mode);
  const feet = table.view.getUint16(
    table.dataOffset + 2 * (m * n * n + i * n + j),
    true,
  );
  if (feet === ROUTES_UNKNOWN) return null;
  return feet === ROUTES_NO_ROUTE ? "no-route" : feet;
}

export type RoutesEncodeInput = {
  readonly buildings: readonly BuildingCode[];
  /** Feet from `from` to `to` (rounded and clamped on write), "no-route", or null when not computed yet. */
  readonly distance: (
    mode: TravelMode,
    from: BuildingCode,
    to: BuildingCode,
  ) => RouteDistance;
};

/** Builds the binary. Buildings are sorted and deduplicated; the diagonal is 0. */
export function encodeRoutes(input: RoutesEncodeInput): Uint8Array {
  const buildings = [...new Set(input.buildings)].sort();
  const n = buildings.length;
  const index = new TextEncoder().encode(
    JSON.stringify({ buildings, modes: TRAVEL_MODES }),
  );
  const indexEnd = ROUTES_HEADER_BYTES + index.byteLength;
  const dataOffset = indexEnd + padTo4(indexEnd);
  const out = new Uint8Array(dataOffset + 2 * MODE_COUNT * n * n);
  const view = new DataView(out.buffer);
  for (let k = 0; k < ROUTES_MAGIC.length; k++)
    out[k] = ROUTES_MAGIC.charCodeAt(k);
  view.setUint16(4, ROUTES_BINARY_VERSION, true);
  view.setUint16(6, n, true);
  view.setUint8(8, MODE_COUNT);
  view.setUint32(12, index.byteLength, true);
  out.set(index, ROUTES_HEADER_BYTES);

  TRAVEL_MODES.forEach((mode, m) => {
    buildings.forEach((from, i) => {
      buildings.forEach((to, j) => {
        let cell = 0;
        if (i !== j) {
          const feet = input.distance(mode, from, to);
          cell =
            feet === "no-route"
              ? ROUTES_NO_ROUTE
              : feet === null || !Number.isFinite(feet)
                ? ROUTES_UNKNOWN
                : Math.min(ROUTES_MAX_FEET, Math.max(0, Math.round(feet)));
        }
        view.setUint16(dataOffset + 2 * (m * n * n + i * n + j), cell, true);
      });
    });
  });
  return out;
}
