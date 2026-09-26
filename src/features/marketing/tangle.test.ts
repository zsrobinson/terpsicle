import { describe, expect, it } from "vitest";
import {
  DETANGLE_MS,
  labelLeft,
  labelWidth,
  lineOffset,
  linePoints,
  PRODUCT_ORDER,
  poseEnds,
  railPath,
  SEGMENTS,
  segments,
  smoothPath,
  sourceLabels,
  TALL_LABEL_BAND,
  TANGLE_SIZE,
  type TangleLayout,
  tanglePath,
} from "./tangle";

const LAYOUTS: TangleLayout[] = ["wide", "tall"];
const LINES = PRODUCT_ORDER.map((_, i) => i);
const us = Array.from({ length: 101 }, (_, k) => k / 100);

describe("the lines", () => {
  it("end straight: parallel from 45% on, each in its product's slot, in color order", () => {
    const slots = LINES.map((i) => lineOffset(i, 1, 1));
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach((v, i) => {
      expect(slots[i]).toBeCloseTo(v, 10);
    });
    for (const i of LINES)
      for (const u of us.filter((u) => u >= 0.45))
        expect(lineOffset(i, u, 1)).toBeCloseTo(slots[i] ?? 0, 10);
  });

  it("start tangled: every line wanders, and they cross", () => {
    for (const i of LINES) {
      const wander = Math.max(
        ...us.map((u) => Math.abs(lineOffset(i, u, 0) - lineOffset(i, u, 1))),
      );
      expect(wander, `line ${i}`).toBeGreaterThan(0.15);
    }
    // Somewhere in the mess the lines aren't in their final order.
    const outOfOrder = us.some((u) => {
      const vs = LINES.map((i) => lineOffset(i, u, 0));
      return vs.some((v, i) => i > 0 && v < (vs[i - 1] ?? 0));
    });
    expect(outOfOrder).toBe(true);
  });

  it("stay inside the box, tangled or straight, in both layouts", () => {
    for (const layout of LAYOUTS) {
      const { width, height } = TANGLE_SIZE[layout];
      for (const i of LINES)
        for (const e of [0, 0.5, 1])
          for (const [x, y] of linePoints(layout, i, e)) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(height);
          }
    }
  });

  it("end where the marks are: the right edge (wide), or the bottom over five equal columns (tall)", () => {
    for (const i of LINES) {
      const wide = linePoints("wide", i, 1).at(-1);
      expect(wide?.[0]).toBe(TANGLE_SIZE.wide.width);
      // Five 76px rows: the rail meets the middle of its mark's row.
      expect(wide?.[1]).toBeCloseTo(38 + 76 * i);
      const tall = linePoints("tall", i, 1).at(-1);
      expect(tall?.[1]).toBe(TANGLE_SIZE.tall.height);
      expect(tall?.[0]).toBeCloseTo((TANGLE_SIZE.tall.width / 5) * (i + 0.5));
    }
  });

  it("draw as one smooth path, straight and tangled", () => {
    const d = smoothPath(linePoints("wide", 0, 1));
    expect(d.startsWith("M0 ")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(SEGMENTS);
    expect(railPath("wide", 2)).not.toBe(tanglePath("wide", 2));
  });
});

describe("the segments", () => {
  it("move from their chord of the tangle to their chord of the straight line", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES) {
        const straight = linePoints(layout, i, 1);
        const tangled = linePoints(layout, i, 0);
        const segs = segments(layout, i);
        expect(segs).toHaveLength(SEGMENTS);
        segs.forEach((s, k) => {
          const [a, b] = poseEnds(s.to, s.length);
          expect(a[0]).toBeCloseTo(straight[k]?.[0] ?? Number.NaN, 6);
          expect(a[1]).toBeCloseTo(straight[k]?.[1] ?? Number.NaN, 6);
          expect(b[0]).toBeCloseTo(straight[k + 1]?.[0] ?? Number.NaN, 6);
          expect(b[1]).toBeCloseTo(straight[k + 1]?.[1] ?? Number.NaN, 6);
          const [ta, tb] = poseEnds(s.from, s.length);
          expect(ta[0]).toBeCloseTo(tangled[k]?.[0] ?? Number.NaN, 6);
          expect(ta[1]).toBeCloseTo(tangled[k]?.[1] ?? Number.NaN, 6);
          expect(tb[0]).toBeCloseTo(tangled[k + 1]?.[0] ?? Number.NaN, 6);
          expect(tb[1]).toBeCloseTo(tangled[k + 1]?.[1] ?? Number.NaN, 6);
        });
      }
  });

  it("turn the short way, never spinning", () => {
    for (const layout of LAYOUTS)
      for (const i of LINES)
        for (const s of segments(layout, i))
          expect(Math.abs(s.from.angle - s.to.angle)).toBeLessThanOrEqual(180);
  });

  it("straighten from the marks back toward the mess, all within the detangle", () => {
    const segs = segments("wide", 0);
    const delays = segs.map((s) => s.delayMs);
    expect(delays).toEqual([...delays].sort((a, b) => b - a));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(0);
    for (const s of segs)
      expect(s.delayMs + s.durationMs).toBeLessThanOrEqual(DETANGLE_MS + 1e-9);
    // The last to settle does so at the very end.
    const first = segs[0];
    expect((first?.delayMs ?? 0) + (first?.durationMs ?? 0)).toBeGreaterThan(
      DETANGLE_MS * 0.98,
    );
  });
});

describe("the sources' labels", () => {
  it("name one source per product, in color order, and one that just goes away", () => {
    for (const layout of LAYOUTS) {
      const labels = sourceLabels(layout);
      expect(labels.filter((l) => l.becomesLine)).toHaveLength(5);
      const gone = labels.filter((l) => !l.becomesLine);
      expect(gone).toHaveLength(1);
      expect(gone[0]).toMatchObject({ dx: 0, dy: 0 });
    }
  });

  it("stay inside the box, straight and in the mess", () => {
    for (const layout of LAYOUTS) {
      const { width, height } = TANGLE_SIZE[layout];
      for (const l of sourceLabels(layout)) {
        const w = labelWidth(layout, l.text);
        for (const [x, y] of [
          [l.x, l.y],
          [l.x + l.dx, l.y + l.dy],
        ] as const) {
          const left = labelLeft(l.anchor, x, w);
          expect(left, l.text).toBeGreaterThanOrEqual(0);
          expect(left + w, l.text).toBeLessThanOrEqual(width + 1e-9);
          expect(y, l.text).toBeGreaterThanOrEqual(0);
          expect(y + 16, l.text).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it.each(LAYOUTS)("never overlap each other once straight (%s)", (layout) => {
    const boxes = sourceLabels(layout)
      .filter((l) => l.becomesLine)
      .map((l) => {
        const w = labelWidth(layout, l.text);
        const left = labelLeft(l.anchor, l.x, w);
        return { l: l.text, left, right: left + w, top: l.y, bottom: l.y + 16 };
      });
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue;
        const apart =
          a.right <= b.left ||
          b.right <= a.left ||
          a.bottom <= b.top ||
          b.bottom <= a.top;
        expect(apart, `${a.l} / ${b.l}`).toBe(true);
      }
    // On a phone, all of them fit in the band above the lines.
    if (layout === "tall")
      for (const b of boxes)
        expect(b.bottom).toBeLessThanOrEqual(TALL_LABEL_BAND);
  });

  it("sit clear of every straight line, their own too (wide)", () => {
    for (const l of sourceLabels("wide").filter((l) => l.becomesLine)) {
      const w = labelWidth("wide", l.text);
      for (const i of LINES) {
        for (const [x, y] of linePoints("wide", i, 1, 201)) {
          if (x > l.x + w) break;
          // The label box, plus half the 3px stroke.
          const inside = y > l.y - 1.5 && y < l.y + 16 + 1.5;
          expect(inside, `${l.text} / line ${i} at x=${x}`).toBe(false);
        }
      }
    }
  });
});
