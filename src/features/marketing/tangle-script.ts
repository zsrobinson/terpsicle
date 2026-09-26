import {
  lineOffset,
  progressAt,
  smoothPath,
  TANGLE_CONFIG,
  type TangleConfig,
} from "./tangle";

// The detangle, played by an inline script right after the hero's drawing
// (src/app/inline-scripts.ts, `tangle`), so it starts at first paint of the
// server-rendered page, before the app's code loads, and finishes before
// hydration. The same function runs from the Hero component when the page
// was reached by a router navigation (no inline script runs then).
//
// The server renders the straight rails (the end state, which is also what
// no-JS readers and reduced motion get). This script writes the tangled
// paths first, then eases them straight, frame by frame, and marks the
// drawing `data-tangle="done"` so the marks can slide in (marketing.css).

/** The attribute on the hero's figure that this script drives. */
export const TANGLE_ATTR = "data-tangle";
/** Dispatched on the figure to play it again. */
export const REPLAY_EVENT = "terpsicle:tangle-replay";

/**
 * Stringified into the page, so it must be self-contained: the geometry
 * comes in as arguments (`offset`, `progress` and `path` are tangle.ts's
 * pure functions), and nothing here refers to this module.
 */
export function playTangle(
  attr: string,
  replayEvent: string,
  config: TangleConfig,
  offset: typeof lineOffset,
  progress: typeof progressAt,
  path: typeof smoothPath,
) {
  const root = document.querySelector<HTMLElement>(`[${attr}]`);
  if (root?.getAttribute(attr) !== "") return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lines = Array.from(
    root.querySelectorAll<SVGPathElement>("path[data-line]"),
  );
  const layoutOf = (el: SVGPathElement) =>
    el.closest<SVGSVGElement>("svg")?.dataset.layout === "tall"
      ? "tall"
      : "wide";
  const draw = (t: number) => {
    for (const el of lines) {
      const layout = layoutOf(el);
      const size = config.sizes[layout];
      const i = Number(el.dataset.line);
      // Each line starts a beat after the one before it.
      const ti = Math.min(
        1,
        Math.max(
          0,
          (t * config.durationMs - i * config.staggerMs) /
            (config.durationMs - (config.lines - 1) * config.staggerMs),
        ),
      );
      const points: (readonly [number, number])[] = [];
      for (let k = 0; k < config.points; k++) {
        const u = k / (config.points - 1);
        const v = offset(
          i,
          u,
          progress(u, ti),
          config.start,
          config.slot,
          config.wobble,
          config.calm[layout],
        );
        points.push(
          layout === "wide"
            ? [u * size.width, v * size.height]
            : [v * size.width, u * size.height],
        );
      }
      el.setAttribute("d", path(points));
    }
  };
  let frame = 0;
  const play = () => {
    cancelAnimationFrame(frame);
    if (reduced.matches) {
      root.setAttribute(attr, "done");
      return;
    }
    root.setAttribute(attr, "playing");
    draw(0);
    let started = 0;
    const step = (now: number) => {
      if (!started) started = now + config.delayMs;
      const t = Math.min(1, Math.max(0, (now - started) / config.durationMs));
      draw(t);
      if (t < 1) frame = requestAnimationFrame(step);
      else root.setAttribute(attr, "done");
    };
    frame = requestAnimationFrame(step);
  };
  root.addEventListener(replayEvent, play);
  play();
}

/** The inline script for `/`, rendered right after the hero's figure. */
export const tangleScript = `(${playTangle.toString()})(${JSON.stringify(TANGLE_ATTR)},${JSON.stringify(REPLAY_EVENT)},${JSON.stringify(TANGLE_CONFIG)},${lineOffset.toString()},${progressAt.toString()},${smoothPath.toString()});`;

/** The same, from the app, for a page reached without the inline script. */
export function playTangleNow(): void {
  playTangle(
    TANGLE_ATTR,
    REPLAY_EVENT,
    TANGLE_CONFIG,
    lineOffset,
    progressAt,
    smoothPath,
  );
}
