// Geometry for drawing a route: bounds for the map, and a flat projection
// for the tile-free drawing. Campus is a few km across, so scaling longitude
// by cos(latitude) is indistinguishable from Web Mercator at this size.

export type LngLat = readonly [lng: number, lat: number];

export type Bounds = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
};

export function boundsOf(points: readonly LngLat[]): Bounds {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, south, east, north };
}

export type Projected = {
  /** SVG points, y down. */
  readonly points: readonly (readonly [number, number])[];
};

/**
 * Fits the points into a `width` × `height` box with `padding` on every
 * side, keeping true proportions and centering the shorter axis.
 */
export function projectToBox(
  points: readonly LngLat[],
  width: number,
  height: number,
  padding: number,
): Projected {
  const b = boundsOf(points);
  const kx = Math.cos((((b.north + b.south) / 2) * Math.PI) / 180);
  const spanX = Math.max((b.east - b.west) * kx, 1e-9);
  const spanY = Math.max(b.north - b.south, 1e-9);
  const scale = Math.min(
    (width - 2 * padding) / spanX,
    (height - 2 * padding) / spanY,
  );
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return {
    points: points.map(([lng, lat]) => [
      offsetX + (lng - b.west) * kx * scale,
      offsetY + (b.north - lat) * scale,
    ]),
  };
}

/** An SVG path through the points, rounded to 0.1 px. */
export function pathData(
  points: readonly (readonly [number, number])[],
): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}
