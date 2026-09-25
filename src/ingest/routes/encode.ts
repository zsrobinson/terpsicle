import {
  ROUTES_BINARY_VERSION,
  ROUTES_HEADER_BYTES,
  ROUTES_MAGIC,
  ROUTES_MAX_FEET,
  ROUTES_UNKNOWN,
  type RoutesIndex,
  RoutesIndexSchema,
} from "~/core/schema";

// The routes binary (DATA.md §4.2) and route geometry simplification. The
// decoder the client uses belongs to core/travel.

/**
 * `matrices[m][i * N + j]` is feet from buildings[i] to buildings[j] in
 * modes[m], or null when unknown.
 */
export function encodeRoutes(
  index: RoutesIndex,
  matrices: readonly (readonly (number | null)[])[],
): Uint8Array {
  const parsed = RoutesIndexSchema.parse(index);
  const n = parsed.buildings.length;
  const m = parsed.modes.length;
  if (new Set(parsed.buildings).size !== n || parsed.buildings.some((b, i) => i > 0 && (parsed.buildings[i - 1] ?? "") >= b)) {
    throw new Error("Routes index buildings must be sorted and unique");
  }
  if (matrices.length !== m || matrices.some((matrix) => matrix.length !== n * n)) {
    throw new Error(`Expected ${m} matrices of ${n}×${n} cells`);
  }
  const json = new TextEncoder().encode(JSON.stringify(parsed));
  const indexEnd = ROUTES_HEADER_BYTES + json.length;
  const padding = (4 - (indexEnd % 4)) % 4;
  const dataStart = indexEnd + padding;
  const bytes = new Uint8Array(dataStart + 2 * m * n * n);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = ROUTES_MAGIC.charCodeAt(i);
  view.setUint16(4, ROUTES_BINARY_VERSION, true);
  view.setUint16(6, n, true);
  view.setUint8(8, m);
  view.setUint32(12, json.length, true);
  bytes.set(json, ROUTES_HEADER_BYTES);
  matrices.forEach((matrix, mi) => {
    matrix.forEach((feet, cell) => {
      const value =
        feet === null || !Number.isFinite(feet)
          ? ROUTES_UNKNOWN
          : Math.min(ROUTES_MAX_FEET, Math.max(0, Math.round(feet)));
      view.setUint16(dataStart + 2 * (mi * n * n + cell), value, true);
    });
  });
  return bytes;
}

/** Metres between two [lng, lat] points, equirectangular (fine at campus scale). */
function metres(a: readonly [number, number], b: readonly [number, number]): number {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111_320 * Math.cos(lat);
  const dy = (b[1] - a[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function distanceToSegment(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const lat = a[1] * (Math.PI / 180);
  const kx = 111_320 * Math.cos(lat);
  const ky = 110_540;
  const [px, py] = [(p[0] - a[0]) * kx, (p[1] - a[1]) * ky];
  const [bx, by] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Douglas–Peucker at `toleranceMetres` (1 m keeps the drawn path on the
 * sidewalk), then rounded to 6 decimals (~0.1 m) with repeats dropped.
 */
export function simplifyPath(
  path: readonly [number, number][],
  toleranceMetres = 1,
): [number, number][] {
  if (path.length <= 2) return path.map(round6);
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: the loop condition guarantees an element.
    const [first, last] = stack.pop()!;
    let worst = -1;
    let worstDistance = 0;
    for (let i = first + 1; i < last; i++) {
      // biome-ignore lint/style/noNonNullAssertion: first < i < last are in range.
      const d = distanceToSegment(path[i]!, path[first]!, path[last]!);
      if (d > worstDistance) {
        worstDistance = d;
        worst = i;
      }
    }
    if (worst >= 0 && worstDistance > toleranceMetres) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  const out: [number, number][] = [];
  path.forEach((p, i) => {
    if (!keep[i]) return;
    const r = round6(p);
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== r[0] || prev[1] !== r[1]) out.push(r);
  });
  if (out.length === 1) out.push(round6(path[path.length - 1] ?? path[0] ?? [0, 0]));
  return out;
}

function round6(p: readonly [number, number]): [number, number] {
  return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
}

/** Total length of a path in feet, for sanity checks. */
export function pathFeet(path: readonly [number, number][]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: i and i-1 are in range.
    total += metres(path[i - 1]!, path[i]!);
  }
  return total * 3.28084;
}
