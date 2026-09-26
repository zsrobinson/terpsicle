// The hero's geometry: five tangled lines, one per product, that straighten
// into five parallel rails ending in the products' marks (Fable's "Detangle").
// Pure numbers, so the server renders the same SVG the browser hydrates.
//
// Lines live in flow coordinates: `u` runs along the flow (0 at the mess, 1
// at the marks) and `v` across it (0…1). The wide layout flows left to
// right; the tall one (phones and tablets) flows top to bottom into a row of
// marks. The motion only moves transforms and opacity: each line is cut into
// short segments, each drawn at its place on the straight line and moved
// there from its place on the tangle (a translate, a rotate and a stretch).

export const PRODUCT_ORDER = [
  "schedule",
  "reviews",
  "chat",
  "plan",
  "todo",
] as const;

export type TangleLayout = "wide" | "tall";

/** The SVG's viewBox, in the pixels it's drawn at (near enough). */
export const TANGLE_SIZE: Record<
  TangleLayout,
  { width: number; height: number }
> = {
  // 76px per rail, so each mark's row centers on its rail.
  wide: { width: 800, height: 380 },
  tall: { width: 360, height: 320 },
};

/** The tall layout's band above the lines, for the sources' labels. */
export const TALL_LABEL_BAND = 52;

/** Segments per line: enough that the tangle reads as a curve. */
export const SEGMENTS = 40;

/** The whole detangle, from the first segment moving to the last settling. */
export const DETANGLE_MS = 2000;
/** Before it starts: the headline settles first. */
export const DETANGLE_DELAY_MS = 450;

/** Where each rail ends, across the flow: evenly spaced, in color order. */
const SLOT = [0.1, 0.3, 0.5, 0.7, 0.9] as const;
/** Where each line starts, across the flow: scattered. */
const START = [0.6, 0.1, 0.75, 0.33, 0.93] as const;
const PHASE = [0.1, 0.55, 0.3, 0.8, 0] as const;
const PHASE_2 = [0.4, 0.1, 0.7, 0.25, 0.9] as const;

export type Point = readonly [x: number, y: number];

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Line `i`'s position across the flow at `u`, `e` of the way from tangled
 * (0) to straight (1). Straight, it runs from its start to its slot over the
 * first 45%, then parallel to the others.
 */
export function lineOffset(i: number, u: number, e: number): number {
  const start = START[i] ?? 0.5;
  const slot = SLOT[i] ?? 0.5;
  const straight = start + (slot - start) * smooth(u / 0.45);
  // The wobble fades in at the mess's edge and out before the marks.
  const envelope = smooth(u / 0.12) * (1 - smooth((u - 0.6) / 0.3));
  const wobble =
    0.33 * Math.sin(2 * Math.PI * (1.6 * u + (PHASE[i] ?? 0))) +
    0.15 * Math.sin(2 * Math.PI * (3.7 * u + (PHASE_2[i] ?? 0)));
  return clamp(straight + wobble * envelope * (1 - e), 0.03, 0.97);
}

/** Flow coordinates to the layout's pixels. */
export function toPoint(layout: TangleLayout, u: number, v: number): Point {
  const { width, height } = TANGLE_SIZE[layout];
  return layout === "wide"
    ? [u * width, v * height]
    : [v * width, TALL_LABEL_BAND + u * (height - TALL_LABEL_BAND)];
}

/** `count` points along line `i`, `e` of the way to straight. */
export function linePoints(
  layout: TangleLayout,
  i: number,
  e: number,
  count = SEGMENTS + 1,
): Point[] {
  return Array.from({ length: count }, (_, k) => {
    const u = k / (count - 1);
    return toPoint(layout, u, lineOffset(i, u, e));
  });
}

const num = (x: number) => String(Math.round(x * 100) / 100);

/** A smooth path through `points` (Catmull-Rom as cubic Béziers). */
export function smoothPath(points: readonly Point[]): string {
  const at = (k: number): Point =>
    points[clamp(k, 0, points.length - 1)] ?? [0, 0];
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

/** Line `i` straight: the rail that carries on down the page. */
export function railPath(layout: TangleLayout, i: number): string {
  return smoothPath(linePoints(layout, i, 1, 49));
}

/** Line `i` tangled: the misprint that settles, and reduced motion's ghost. */
export function tanglePath(layout: TangleLayout, i: number): string {
  return smoothPath(linePoints(layout, i, 0, 49));
}

/** A segment's place: its midpoint, direction (degrees) and stretch. */
export interface Pose {
  x: number;
  y: number;
  angle: number;
  stretch: number;
}

export interface Segment {
  /** Its length on the straight line; it's drawn centered on the origin. */
  length: number;
  /** On the straight line: where it ends up. */
  to: Pose;
  /** On the tangle: where it starts. */
  from: Pose;
  delayMs: number;
  durationMs: number;
}

const angleOf = (a: Point, b: Point) =>
  (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

/**
 * Line `i` as segments, each moving from its chord of the tangle to its
 * chord of the straight line. The far end straightens first and the wave
 * runs back toward the mess, as in the prototype's
 * `ease(t·1.35 − (1 − u)·0.35)`: every point takes 1/1.35 of the whole, and
 * the last starts 0.35/1.35 in.
 */
export function segments(layout: TangleLayout, i: number): Segment[] {
  const straight = linePoints(layout, i, 1);
  const tangled = linePoints(layout, i, 0);
  const durationMs = DETANGLE_MS / 1.35;
  return straight.slice(0, -1).map((a, k) => {
    const b = straight[k + 1] ?? a;
    const ta = tangled[k] ?? a;
    const tb = tangled[k + 1] ?? b;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const toAngle = angleOf(a, b);
    // The short way round, so no segment spins.
    const turn = ((angleOf(ta, tb) - toAngle + 540) % 360) - 180;
    const u = (k + 0.5) / SEGMENTS;
    return {
      length,
      to: {
        x: (a[0] + b[0]) / 2,
        y: (a[1] + b[1]) / 2,
        angle: toAngle,
        stretch: 1,
      },
      from: {
        x: (ta[0] + tb[0]) / 2,
        y: (ta[1] + tb[1]) / 2,
        angle: toAngle + turn,
        stretch: Math.hypot(tb[0] - ta[0], tb[1] - ta[1]) / length,
      },
      delayMs: ((1 - u) * 0.35 * DETANGLE_MS) / 1.35,
      durationMs,
    };
  });
}

/** A pose as a CSS transform (SVG user units are CSS pixels). */
export function poseTransform(p: Pose): string {
  return `translate(${num(p.x)}px, ${num(p.y)}px) rotate(${num(p.angle)}deg) scale(${num(p.stretch)}, 1)`;
}

/** Where a pose's segment ends are: for tests, and nothing else. */
export function poseEnds(p: Pose, length: number): [Point, Point] {
  const r = (p.angle * Math.PI) / 180;
  const hx = (Math.cos(r) * length * p.stretch) / 2;
  const hy = (Math.sin(r) * length * p.stretch) / 2;
  return [
    [p.x - hx, p.y - hy],
    [p.x + hx, p.y + hy],
  ];
}

/**
 * What the lines used to be, one per product in color order, plus one that
 * simply goes away. The tangle's sources: a Testudo tab becomes Schedule,
 * RateMyProfessors Reviews, and so on.
 */
export const SOURCES = [
  "a Testudo tab",
  "RateMyProfessors?",
  "the group chat",
  "a four-year plan PDF",
  "the ELMS calendar",
  "a spreadsheet",
] as const;

/** Where each label sits in the mess (flow coordinates). */
const MESS = [
  [0.28, 0.2],
  [0.36, 0.72],
  [0.22, 0.5],
  [0.44, 0.36],
  [0.3, 0.88],
  [0.48, 0.6],
] as const;

export type Anchor = "start" | "middle" | "end";

export interface SourceLabel {
  text: string;
  /** The label's box: its anchor point's x, and its top. */
  x: number;
  y: number;
  anchor: Anchor;
  /** Where it starts, in the mess, relative to where it ends up. */
  dx: number;
  dy: number;
  /** False for the source that fades away instead of becoming a line. */
  becomesLine: boolean;
}

/** Label type, in px: 12px (wide) and 11px (tall) semibold. */
const LABEL_LINE = 16;
const TALL_ROW = 16;
/** A generous per-character width for the label face, for spacing only. */
export function labelWidth(layout: TangleLayout, text: string): number {
  return text.length * (layout === "wide" ? 6.6 : 6.1);
}

/** Left edge of a label anchored at `x`. */
export function labelLeft(anchor: Anchor, x: number, width: number): number {
  return anchor === "start"
    ? x
    : anchor === "middle"
      ? x - width / 2
      : x - width;
}

/**
 * The sources' labels. Straight, each sits at its line's start: above it on
 * the left (wide), or in the band over the lines (tall), in as few rows as
 * keep them apart. Tangled, they're scattered through the mess.
 */
export function sourceLabels(layout: TangleLayout): SourceLabel[] {
  const { width } = TANGLE_SIZE[layout];
  const rows: { left: number; right: number }[][] = [];
  return SOURCES.map((text, i) => {
    const w = labelWidth(layout, text);
    const [mu, mv] = MESS[i] ?? [0.5, 0.5];
    const mess = toPoint(layout, mu, mv);
    const becomesLine = i < PRODUCT_ORDER.length;
    // In the mess, a label keeps its anchor and stays inside the box.
    const inMess = (a: Anchor) =>
      clamp(labelLeft(a, mess[0], w), 0, width - w) - labelLeft(a, 0, w);
    const messY = mess[1] - LABEL_LINE - 2;
    if (!becomesLine) {
      const anchor = layout === "wide" ? "start" : "middle";
      const x = inMess(anchor);
      return { text, x, y: messY, anchor, dx: 0, dy: 0, becomesLine };
    }
    let x: number;
    let y: number;
    let anchor: Anchor = "start";
    const start = toPoint(layout, 0, lineOffset(i, 0, 1));
    if (layout === "wide") {
      x = start[0] + 2;
      // On the side the line leaves: below a line that heads up.
      const headsUp = lineOffset(i, 0.2, 1) < lineOffset(i, 0, 1);
      y = headsUp ? start[1] + 3 : start[1] - LABEL_LINE - 3;
    } else {
      x = start[0];
      anchor = x - w / 2 < 0 ? "start" : x + w / 2 > width ? "end" : "middle";
      const left = labelLeft(anchor, x, w);
      const gap = 8;
      let row = rows.findIndex((r) =>
        r.every((b) => left + w + gap <= b.left || left >= b.right + gap),
      );
      if (row === -1) row = rows.push([]) - 1;
      rows[row]?.push({ left, right: left + w });
      y = row * TALL_ROW;
    }
    return {
      text,
      x,
      y,
      anchor,
      dx: inMess(anchor) - x,
      dy: messY - y,
      becomesLine,
    };
  });
}
