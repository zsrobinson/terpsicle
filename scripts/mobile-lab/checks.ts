// What a step's probe must satisfy. Pure functions of the probe, so they
// read the same on every engine and are unit tested (checks.test.ts).

import { FRAME_COLUMNS } from "./page-scripts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface Scroller {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  rect: Rect | null;
}

export interface LabEvent {
  t: number;
  type: string;
  [key: string]: unknown;
}

/** `[t, ...FRAME_COLUMNS]` */
export type Frame = [number, ...(number | string | null)[]];

/** What `PROBE` returns (page-scripts.ts). */
export interface Probe {
  url: string;
  title: string;
  timeOrigin: number;
  installed: boolean;
  /** The recorder's id for this page load (null: not installed). */
  labId: string | null;
  innerWidth: number;
  innerHeight: number;
  outerWidth: number;
  outerHeight: number;
  devicePixelRatio: number;
  screen: { width: number; height: number; orientation: string | null };
  visualViewport: {
    width: number;
    height: number;
    offsetTop: number;
    offsetLeft: number;
    pageTop: number;
    scale: number;
  } | null;
  scrollX: number;
  scrollY: number;
  document: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  drawer: {
    snap: string | null;
    rect: Rect | null;
    transform: string;
    contentHeight: number | null;
  } | null;
  activeElement: {
    describe: string;
    textEntry: boolean;
    rect: Rect | null;
    hit: string | null;
    value: string | null;
  } | null;
  panel: {
    heading: string | null;
    body: Scroller | null;
    layer: Scroller | null;
  } | null;
  searchResults: Scroller | null;
  resultCount: number;
  calendar: Scroller | null;
  events: LabEvent[];
  frames: Frame[];
  errors: string[];
}

export interface Check {
  id: string;
  ok: boolean;
  /** A failed "fail" check fails the run; a "warn" is reported only. */
  severity: "fail" | "warn";
  detail: string;
}

export interface StepContext {
  /** The recorder id of the page load the scenario started with. */
  labId: string;
  /** The drawer should be resting (no gesture or animation in flight). */
  settled: boolean;
}

/** Allowance for subpixel layout and rounding. */
const SLACK = 2;

/** The visible band of the layout viewport: what isn't under a keyboard. */
export function visibleBand(p: Probe): { top: number; bottom: number } {
  const vv = p.visualViewport;
  if (!vv) return { top: 0, bottom: p.innerHeight };
  return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
}

/**
 * The drawer's snap heights, as `snapHeights` in src/app/mobile-drawer.tsx
 * computes them (restated: scripts don't import the app).
 */
export function expectedDrawerTop(p: Probe): number | null {
  const snap = p.drawer?.snap;
  const h = p.innerHeight;
  const full = h - 48;
  const heights: Record<string, number> = {
    peek: 124,
    half: h < 480 ? full : Math.round(h * 0.5),
    full,
  };
  const height = snap ? heights[snap] : undefined;
  return height === undefined ? null : h - height;
}

export function stepChecks(p: Probe, ctx: StepContext): Check[] {
  const checks: Check[] = [];
  const add = (
    id: string,
    ok: boolean,
    severity: Check["severity"],
    detail: string,
  ) => checks.push({ id, ok, severity, detail });

  // A reload loses the recorder installed in the page, and its id.
  const sameLoad = p.installed && p.labId === ctx.labId;
  add(
    "no-reload",
    sameLoad,
    "fail",
    sameLoad
      ? "same page load"
      : "the page reloaded or navigated (the recorder installed at the start is gone)",
  );
  add(
    "no-page-errors",
    p.errors.length === 0,
    "fail",
    p.errors.length === 0 ? "none" : p.errors.join(" | "),
  );

  const a = p.activeElement;
  if (a?.textEntry && a.rect) {
    const band = visibleBand(p);
    const inside =
      a.rect.y >= band.top - SLACK && a.rect.bottom <= band.bottom + SLACK;
    add(
      "focused-field-visible",
      inside && a.hit === "self",
      "fail",
      `${a.describe} at y ${a.rect.y}–${a.rect.bottom}; visible y ${round(band.top)}–${round(band.bottom)}; on top there: ${a.hit ?? "nothing"}`,
    );
  }

  add(
    "page-not-scrolled",
    Math.abs(p.scrollY) < 1 && Math.abs(p.scrollX) < 1,
    "warn",
    `window scroll ${p.scrollX},${p.scrollY}`,
  );
  const scale = p.visualViewport?.scale ?? 1;
  add(
    "not-zoomed",
    Math.abs(scale - 1) < 0.01,
    "warn",
    `visual viewport scale ${scale}`,
  );
  add(
    "no-horizontal-overflow",
    p.document.scrollWidth <= p.document.clientWidth + 1,
    "warn",
    `document ${p.document.scrollWidth}px wide in ${p.document.clientWidth}px`,
  );

  const d = p.drawer;
  if (d?.rect) {
    add(
      "drawer-on-screen",
      d.rect.y >= -SLACK && d.rect.y < p.innerHeight,
      "fail",
      `drawer top ${d.rect.y} in a ${p.innerHeight}px viewport`,
    );
    const expected = expectedDrawerTop(p);
    if (ctx.settled && expected !== null)
      add(
        "drawer-rests-at-snap",
        Math.abs(d.rect.y - expected) <= 4,
        "warn",
        `${d.snap}: top ${d.rect.y}, expected ${expected}`,
      );
  }
  return checks;
}

/** One column of the frame trace, with its timestamps. */
export function frameSeries(
  frames: Frame[],
  column: (typeof FRAME_COLUMNS)[number],
): { t: number; v: number }[] {
  const i = FRAME_COLUMNS.indexOf(column) + 1;
  return frames.flatMap((f) => {
    const v = f[i];
    return typeof v === "number" ? [{ t: f[0], v }] : [];
  });
}

/**
 * Times the drawer changed direction by more than `min` px within a step:
 * a drawer that goes up, down and up again flashed or jumped.
 */
export function reversals(values: number[], min = 24): number {
  let count = 0;
  let direction = 0;
  let anchor = values[0];
  if (anchor === undefined) return 0;
  for (const v of values) {
    const delta = v - anchor;
    if (Math.abs(delta) < min) continue;
    const d = Math.sign(delta);
    if (direction !== 0 && d !== direction) count++;
    direction = d;
    anchor = v;
  }
  return count;
}

/** Checks over the frames recorded during a step (motion, not a moment). */
export function traceChecks(frames: Frame[]): Check[] {
  const checks: Check[] = [];
  const drawer = frameSeries(frames, "drawerTop").map((s) => s.v);
  if (drawer.length > 1) {
    const n = reversals(drawer);
    checks.push({
      id: "drawer-moves-one-way",
      ok: n <= 1,
      severity: "warn",
      detail: `${n} reversal(s) over ${drawer.length} frames (${Math.min(...drawer)}–${Math.max(...drawer)})`,
    });
  }
  // The focused field above the visible band at any frame: the page panned
  // it out of sight, even if only for a moment.
  const i = {
    top: FRAME_COLUMNS.indexOf("focusedTop") + 1,
    vvTop: FRAME_COLUMNS.indexOf("vvOffsetTop") + 1,
  };
  const hidden = frames.filter((f) => {
    const top = f[i.top];
    const vvTop = f[i.vvTop];
    return typeof top === "number" && typeof vvTop === "number"
      ? top < vvTop - SLACK
      : false;
  });
  if (hidden.length > 0)
    checks.push({
      id: "focused-field-never-above-view",
      ok: false,
      severity: "warn",
      detail: `in ${hidden.length} frame(s) the focused field was above the visible area`,
    });
  return checks;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
