// The hero's geometry: five tangled lines, one per product, that straighten
// into five parallel rails ending in the products' marks (the "Detangle"
// prototype, marketing-v3). Pure numbers, shared by the server render (the
// end state), the inline script that plays the detangle before the app's
// code loads (tangle-script.ts), the tests and the link-preview image
// (scripts/build-og-image.ts).
//
// Lines live in flow coordinates: `u` runs along the flow (0 at the mess, 1
// at the marks) and `v` across it (0…1). The wide layout flows left to
// right into a column of marks; the tall one (phones) flows top to bottom
// into a row of them. Every function here is self-contained (no closures
// over module state), so the inline script can carry it as text.

export const PRODUCT_ORDER = [
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
] as const;

export type TangleProduct = (typeof PRODUCT_ORDER)[number];

export type TangleLayout = "wide" | "tall";

/** The SVG's viewBox per layout, in the pixels it's drawn at (near enough). */
export const TANGLE_SIZE: Record<
  TangleLayout,
  { width: number; height: number }
> = {
  // 72px per rail: each mark's row centers on its rail.
  wide: { width: 640, height: 360 },
  tall: { width: 360, height: 280 },
};

/** Points per line: enough that the tangle reads as a curve. */
export const POINTS = 25;

/** Before the detangle starts, so the tangle registers first. */
export const DETANGLE_DELAY_MS = 350;
/** The whole detangle, first move to last settle. */
export const DETANGLE_MS = 1700;
/** Each line starts this much after the one before it. */
export const STAGGER_MS = 70;

/**
 * Where each line starts and ends across the flow, in color order. The
 * starts are scattered so the straight lines still cross once, like cables
 * sorted into a rack; the ends are evenly spaced slots.
 */
export const START = [0.62, 0.1, 0.84, 0.34, 0.96] as const;
export const SLOT = [0.1, 0.3, 0.5, 0.7, 0.9] as const;

/**
 * The tangle. Each line wobbles with two sine waves whose phases differ per
 * line, so they cross each other many times; the wobble fades in after the
 * labels and out before the marks. Amplitudes are fractions of the height.
 */
export const WOBBLE = {
  phase1: [0.12, 0.58, 0.31, 0.8, 0.02] as const,
  phase2: [0.42, 0.08, 0.7, 0.24, 0.9] as const,
  freq1: 2,
  freq2: 4.4,
  amp1: 0.3,
  amp2: 0.14,
} as const;

/**
 * How far along the flow the lines run calm before the tangle: room for the
 * wide layout's labels at the lines' starts; the tall one has none.
 */
export const CALM: Record<TangleLayout, number> = { wide: 0.15, tall: 0.03 };

export type Point = readonly [x: number, y: number];

/**
 * Line `i`'s position across the flow at `u`, `e` of the way from tangled
 * (0) to straight (1). Straight, it runs from its start to its slot over
 * the middle of the flow, then parallel to the others. Self-contained.
 */
export function lineOffset(
  i: number,
  u: number,
  e: number,
  start: readonly number[],
  slot: readonly number[],
  wobble: {
    phase1: readonly number[];
    phase2: readonly number[];
    freq1: number;
    freq2: number;
    amp1: number;
    amp2: number;
  },
  calm: number,
): number {
  const clamp = (x: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, x));
  const smooth = (x: number) => {
    const t = clamp(x, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const from = start[i] ?? 0.5;
  const to = slot[i] ?? 0.5;
  const straight = from + (to - from) * smooth((u - calm - 0.05) / 0.5);
  // The wobble sits in the middle: calm under the labels, calm at the marks.
  const envelope = smooth((u - calm) / 0.15) * (1 - smooth((u - 0.6) / 0.28));
  const wave =
    wobble.amp1 *
      Math.sin(2 * Math.PI * (wobble.freq1 * u + (wobble.phase1[i] ?? 0))) +
    wobble.amp2 *
      Math.sin(2 * Math.PI * (wobble.freq2 * u + (wobble.phase2[i] ?? 0)));
  // Less room to wobble near the edges, so no line flattens against them.
  const room = 0.45 + 0.55 * (1 - (2 * straight - 1) ** 2);
  return clamp(straight + wave * envelope * room * (1 - e), 0.03, 0.97);
}

/**
 * How straight line `i` is at `u` when the detangle is `t` (0…1) along: the
 * far end (the marks) straightens first and the wave runs back toward the
 * mess, as in the prototype. Eased out, so the last stretch settles gently.
 * Self-contained.
 */
export function progressAt(u: number, t: number): number {
  const x = Math.min(1, Math.max(0, t * 1.35 - (1 - u) * 0.35));
  return 1 - (1 - x) ** 3;
}

/** Flow coordinates to a layout's pixels. */
export function toPoint(
  layout: TangleLayout,
  u: number,
  v: number,
  size: { width: number; height: number },
): Point {
  return layout === "wide"
    ? [u * size.width, v * size.height]
    : [v * size.width, u * size.height];
}

/**
 * `count` points along line `i` with the detangle `t` along (1 for the
 * straight rail, 0 for the tangle).
 */
export function linePoints(
  layout: TangleLayout,
  i: number,
  t: number,
  count = POINTS,
): Point[] {
  const size = TANGLE_SIZE[layout];
  return Array.from({ length: count }, (_, k) => {
    const u = k / (count - 1);
    const e = progressAt(u, t);
    return toPoint(
      layout,
      u,
      lineOffset(i, u, e, START, SLOT, WOBBLE, CALM[layout]),
      size,
    );
  });
}

/** A smooth path through `points` (Catmull-Rom as cubic Béziers). Self-contained. */
export function smoothPath(points: readonly Point[]): string {
  const num = (x: number) => String(Math.round(x * 10) / 10);
  const at = (k: number): Point =>
    points[Math.min(points.length - 1, Math.max(0, k))] ?? [0, 0];
  const [x0, y0] = at(0);
  let d = `M${num(x0)} ${num(y0)}`;
  for (let k = 0; k < points.length - 1; k++) {
    const [ax, ay] = at(k - 1);
    const [bx, by] = at(k);
    const [cx, cy] = at(k + 1);
    const [dx, dy] = at(k + 2);
    d += `C${num(bx + (cx - ax) / 6)} ${num(by + (cy - ay) / 6)} ${num(
      cx - (dx - bx) / 6,
    )} ${num(cy - (dy - by) / 6)} ${num(cx)} ${num(cy)}`;
  }
  return d;
}

/** Line `i` straight: the rail the page shows once the detangle is done. */
export function railPath(layout: TangleLayout, i: number): string {
  return smoothPath(linePoints(layout, i, 1));
}

/** Line `i` tangled: where the detangle starts, and reduced motion's ghost. */
export function tanglePath(layout: TangleLayout, i: number): string {
  return smoothPath(linePoints(layout, i, 0));
}

/** Where line `i` begins (its label's anchor) and ends (its mark), in pixels. */
export function lineEnds(
  layout: TangleLayout,
  i: number,
): { start: Point; end: Point } {
  const size = TANGLE_SIZE[layout];
  const calm = CALM[layout];
  return {
    start: toPoint(
      layout,
      0,
      lineOffset(i, 0, 1, START, SLOT, WOBBLE, calm),
      size,
    ),
    end: toPoint(
      layout,
      1,
      lineOffset(i, 1, 1, START, SLOT, WOBBLE, calm),
      size,
    ),
  };
}

/**
 * What each line used to be, in color order: the tab or file the product
 * replaces. The wide layout writes these at the lines' starts.
 */
export const SOURCES: Record<TangleProduct, string> = {
  schedule: "a Testudo tab",
  reviews: "RateMyProfessors?",
  chat: "the group chat",
  plan: "a four-year plan PDF",
  todo: "the ELMS calendar",
};

/** Everything the inline script needs, as plain data. */
export const TANGLE_CONFIG = {
  sizes: TANGLE_SIZE,
  points: POINTS,
  delayMs: DETANGLE_DELAY_MS,
  durationMs: DETANGLE_MS,
  staggerMs: STAGGER_MS,
  start: START,
  slot: SLOT,
  wobble: WOBBLE,
  calm: CALM,
  lines: PRODUCT_ORDER.length,
} as const;

export type TangleConfig = typeof TANGLE_CONFIG;
