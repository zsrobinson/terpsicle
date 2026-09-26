import { describe, expect, it } from "vitest";
import {
  CALM,
  lineEnds,
  lineOffset,
  linePoints,
  PRODUCT_ORDER,
  progressAt,
  railPath,
  SLOT,
  START,
  smoothPath,
  TANGLE_SIZE,
  tanglePath,
  WOBBLE,
} from "./tangle";

const LAYOUTS = ["wide", "tall"] as const;
const LINES = PRODUCT_ORDER.map((_, i) => i);

/** How far apart two lines are across the flow at `u`, straight. */
function gap(layout: "wide" | "tall", i: number, j: number, u: number) {
  const calm = CALM[layout];
  return Math.abs(
    lineOffset(i, u, 1, START, SLOT, WOBBLE, calm) -
      lineOffset(j, u, 1, START, SLOT, WOBBLE, calm),
  );
}

describe("the rails (straight)", () => {
  it("end in five evenly spaced slots, in color order, top to bottom", () => {
    for (const layout of LAYOUTS) {
      const ends = LINES.map((i) => lineEnds(layout, i).end);
      const across = ends.map(([x, y]) => (layout === "wide" ? y : x));
      const size = TANGLE_SIZE[layout];
      const span = layout === "wide" ? size.height : size.width;
      expect(across.map((v) => Math.round((v / span) * 100) / 100)).toEqual([
        ...SLOT,
      ]);
      // And the far end sits at the edge, where the marks are.
      for (const [x, y] of ends)
        expect(layout === "wide" ? x : y).toBe(
          layout === "wide" ? size.width : size.height,
        );
    }
  });

  it("start scattered, so the lines cross on their way to the slots", () => {
    for (const layout of LAYOUTS) {
      const starts = LINES.map((i) => lineEnds(layout, i).start);
      const across = starts.map(([x, y]) => (layout === "wide" ? y : x));
      const span =
        layout === "wide" ? TANGLE_SIZE.wide.height : TANGLE_SIZE.tall.width;
      expect(across.map((v) => Math.round((v / span) * 100) / 100)).toEqual([
        ...START,
      ]);
      // Not already in slot order: at least two lines swap places.
      const order = [...across.keys()].sort(
        (a, b) => (across[a] ?? 0) - (across[b] ?? 0),
      );
      expect(order).not.toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("run calm at both ends: flat under the labels and flat into the marks", () => {
    for (const layout of LAYOUTS) {
      const calm = CALM[layout];
      for (const i of LINES) {
        const at = (u: number) =>
          lineOffset(i, u, 1, START, SLOT, WOBBLE, calm);
        expect(Math.abs(at(calm) - at(0))).toBeLessThan(0.01);
        expect(Math.abs(at(1) - at(0.85))).toBeLessThan(0.01);
      }
    }
  });

  it("keep the labels' rows apart in the wide layout", () => {
    // Labels are 16px tall, above their line's start; the closest pair of
    // starts must clear that.
    const ys = LINES.map((i) => lineEnds("wide", i).start[1]).sort(
      (a, b) => a - b,
    );
    for (let k = 1; k < ys.length; k++)
      expect((ys[k] ?? 0) - (ys[k - 1] ?? 0)).toBeGreaterThanOrEqual(40);
  });

  it("never leave the box", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES)
        for (const t of [0, 0.3, 0.6, 1])
          for (const [x, y] of linePoints(layout, i, t)) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(TANGLE_SIZE[layout].width);
            expect(y).toBeLessThanOrEqual(TANGLE_SIZE[layout].height);
          }
  });

  it("straight, two lines cross at most once", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES)
        for (const j of LINES) {
          if (j <= i) continue;
          let crossings = 0;
          let last = Math.sign(
            lineOffset(i, 0, 1, START, SLOT, WOBBLE, CALM[layout]) -
              lineOffset(j, 0, 1, START, SLOT, WOBBLE, CALM[layout]),
          );
          for (let k = 1; k <= 100; k++) {
            const u = k / 100;
            const sign = Math.sign(
              lineOffset(i, u, 1, START, SLOT, WOBBLE, CALM[layout]) -
                lineOffset(j, u, 1, START, SLOT, WOBBLE, CALM[layout]),
            );
            if (sign !== last && sign !== 0) crossings++;
            if (sign !== 0) last = sign;
          }
          expect(crossings, `${layout} ${i}×${j}`).toBeLessThanOrEqual(1);
          expect(gap(layout, i, j, 1)).toBeGreaterThan(0.1);
        }
  });
});

describe("the tangle", () => {
  it("is visibly tangled: every line strays far from its straight course", () => {
    for (const layout of LAYOUTS) {
      const span =
        layout === "wide" ? TANGLE_SIZE.wide.height : TANGLE_SIZE.tall.width;
      for (const i of LINES) {
        const straight = linePoints(layout, i, 1);
        const tangled = linePoints(layout, i, 0);
        const stray = Math.max(
          ...straight.map(([sx, sy], k) => {
            const [tx, ty] = tangled[k] ?? [sx, sy];
            return layout === "wide" ? Math.abs(ty - sy) : Math.abs(tx - sx);
          }),
        );
        expect(stray / span, `${layout} line ${i}`).toBeGreaterThan(0.12);
      }
    }
  });

  it("makes lines cross each other more than the straight rails do", () => {
    const crossings = (t: number) => {
      let n = 0;
      for (const i of LINES)
        for (const j of LINES) {
          if (j <= i) continue;
          const a = linePoints("wide", i, t);
          const b = linePoints("wide", j, t);
          for (let k = 1; k < a.length; k++) {
            const before =
              Math.sign((a[k - 1]?.[1] ?? 0) - (b[k - 1]?.[1] ?? 0)) ?? 0;
            const after = Math.sign((a[k]?.[1] ?? 0) - (b[k]?.[1] ?? 0));
            if (before !== after) n++;
          }
        }
      return n;
    };
    expect(crossings(0)).toBeGreaterThan(crossings(1) * 2);
  });

  it("straightens from the marks' end back toward the mess, eased", () => {
    // Mid-way, the far end is nearly done and the near end lags behind.
    expect(progressAt(1, 0.5)).toBeGreaterThan(0.85);
    expect(progressAt(0, 0.5)).toBeLessThan(progressAt(1, 0.5) - 0.2);
    expect(progressAt(0, 0.5)).toBeGreaterThan(0);
    // Early on, the near end hasn't moved at all.
    expect(progressAt(0, 0.2)).toBe(0);
    expect(progressAt(1, 0.2)).toBeGreaterThan(0.3);
    for (const u of [0, 0.5, 1]) {
      expect(progressAt(u, 0)).toBe(0);
      expect(progressAt(u, 1)).toBe(1);
    }
    // Monotonic in t at every point along the line.
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      let last = 0;
      for (let k = 1; k <= 20; k++) {
        const p = progressAt(u, k / 20);
        expect(p).toBeGreaterThanOrEqual(last);
        last = p;
      }
    }
  });

  it("changes smoothly between frames: no point jumps", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES) {
        let prev = linePoints(layout, i, 0);
        for (let f = 1; f <= 40; f++) {
          const next = linePoints(layout, i, f / 40);
          for (let k = 0; k < next.length; k++) {
            const [px, py] = prev[k] ?? [0, 0];
            const [nx, ny] = next[k] ?? [0, 0];
            expect(Math.hypot(nx - px, ny - py)).toBeLessThan(14);
          }
          prev = next;
        }
      }
  });
});

describe("paths", () => {
  it("draw one cubic per point after the first, with short numbers", () => {
    const d = smoothPath([
      [0, 0],
      [10, 10.123],
      [20, 0],
    ]);
    expect(d).toMatch(/^M0 0C[\d. -]+C[\d. -]+$/);
    expect(d).toContain("10.1");
    expect(d).not.toContain("10.12");
  });

  it("are the same shape tangled and straight, so a browser can tween them", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES) {
        const shape = (d: string) => d.replace(/[\d.-]+/g, "n");
        expect(shape(tanglePath(layout, i))).toBe(shape(railPath(layout, i)));
      }
  });
});
