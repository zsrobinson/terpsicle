import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import {
  drawMark,
  glyphPath,
  MARK_IDS,
  type MarkId,
  type MarkTheme,
  PIXELS,
  TILE,
} from "~/lib/brand/marks";
import {
  BADGE,
  badgePng,
  badgeSvg,
  FAVICON_SVG,
  faviconSvg,
  iconPng,
  iconSvg,
  PNG_ICONS,
} from "./build-icons";
import { ROOT } from "./lib/source-files";

const publicFile = (file: string) => path.join(ROOT, "public", file);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("icon files (scripts/build-icons.ts)", () => {
  it("are the current mark and palette: regenerating changes nothing", () => {
    // If this fails after changing a mark or a color, run
    // `pnpm tsx scripts/build-icons.ts` and commit the files.
    expect(readFileSync(publicFile(FAVICON_SVG), "utf8")).toBe(faviconSvg());
    for (const icon of PNG_ICONS) {
      const committed = readFileSync(publicFile(icon.file));
      expect(pngSize(committed), icon.file).toEqual({
        width: icon.size,
        height: icon.size,
      });
      expect(committed.equals(iconPng(icon)), icon.file).toBe(true);
    }
    const badge = readFileSync(publicFile(BADGE.file));
    expect(pngSize(badge)).toEqual({ width: BADGE.size, height: BADGE.size });
    expect(badge.equals(badgePng()), BADGE.file).toBe(true);
  });

  it("draw the notification badge as a solid white glyph on clear", () => {
    const { width, pixels } = new Resvg(badgeSvg(), {
      fitTo: { mode: "width", value: BADGE.size },
    }).render();
    const at = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [...pixels.subarray(i, i + 4)];
    };
    // A corner is clear; the canopy (50% on a tile) and the handle are
    // solid white. 72px: 8px units.
    expect(at(0, 0)[3]).toBe(0);
    expect(at(4.5 * 8, 3.5 * 8)).toEqual([255, 255, 255, 255]);
    expect(at(4.5 * 8, 7.5 * 8)).toEqual([255, 255, 255, 255]);
    expect(at(1.5 * 8, 7.5 * 8)[3]).toBe(0);
  });

  it("keep the maskable icon's glyph inside the 80% safe circle", () => {
    const icon = PNG_ICONS.find((i) => i.variant === "maskable");
    if (!icon) throw new Error("No maskable icon");
    const image = new Resvg(iconSvg(icon), {
      fitTo: { mode: "width", value: icon.size },
    }).render();
    const { width, pixels } = image;
    const center = width / 2;
    const safe = 0.4 * width;
    const tile = [...pixels.subarray(0, 4)];
    // Every pixel that isn't the tile's color is glyph, and inside the circle.
    for (let y = 0; y < width; y += 2)
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const same = [0, 1, 2].every(
          (c) => Math.abs((pixels[i + c] ?? 0) - (tile[c] ?? 0)) < 8,
        );
        if (!same)
          expect(Math.hypot(x - center, y - center)).toBeLessThan(safe);
      }
  });
});

describe("marks (src/lib/brand/marks.ts)", () => {
  it("are the owner's 9×9 drawings: tile, glyph and glyph at 50%", () => {
    for (const id of MARK_IDS) {
      const rows = PIXELS[id];
      expect(rows, id).toHaveLength(TILE);
      for (const row of rows) expect(row, id).toMatch(/^[.#+]{9}$/);
      // A 1-unit border of tile all round, as drawn.
      expect(rows[0], id).toBe(".........");
      expect(rows[8], id).toBe(".........");
      for (const row of rows) expect(`${row[0]}${row[8]}`, id).toBe("..");
      const tones = drawMark(id, 20).layers.flatMap((l) =>
        l.kind === "path" ? [l.opacity] : [],
      );
      expect(tones, id).toEqual([1, 0.5]);
    }
  });

  it("turn each row's runs into rectangles on the grid", () => {
    expect(glyphPath("chat", "#")).toMatch(/^M1 1h7v1h-7Z/);
    expect(glyphPath("umbrella", "#")).toBe(
      "M2 5h5v1h-5ZM4 6h1v1h-1ZM4 7h1v1h-1Z",
    );
  });

  it("draw the umbrella's keyline in dark only, and no product's", () => {
    const keylines = (id: MarkId, theme?: MarkTheme) =>
      drawMark(id, 20, { theme }).layers.filter((l) => l.role === "keyline");
    expect(keylines("umbrella", "dark")).toHaveLength(1);
    expect(keylines("umbrella", "light")).toHaveLength(0);
    // A page switches themes with CSS, so it gets the layer, marked.
    expect(keylines("umbrella")).toMatchObject([{ only: "dark" }]);
    for (const id of MARK_IDS.filter((m) => m !== "umbrella"))
      expect(keylines(id), id).toHaveLength(0);
  });

  it("put a page mark on a 1-unit offset, crisp at 20px, and no offset on an app icon", () => {
    const { viewBox, layers } = drawMark("chat", 20);
    // 10 units in 20px: every unit is 2px, the offset included.
    expect(viewBox).toBe("0 0 10 10");
    expect(layers.find((l) => l.role === "offset")).toMatchObject({
      x: 1,
      y: 1,
      size: TILE,
    });
    for (const variant of ["bleed", "maskable"] as const)
      expect(
        drawMark("umbrella", 180, { variant }).layers.some(
          (l) => l.role === "offset",
        ),
        variant,
      ).toBe(false);
  });

  it("land an app icon's glyph on whole pixels", () => {
    // 192 = 21 × 9 + 3: 21px units, the tile's grid 1px in from the left.
    expect(drawMark("umbrella", 192, { variant: "bleed" }).viewBox).toBe(
      "-0.0476 -0.0476 9.1429 9.1429",
    );
    expect(drawMark("umbrella", 180, { variant: "bleed" }).viewBox).toBe(
      "0 0 9 9",
    );
  });
});
