import { readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { drawMark, MARK_IDS } from "~/app/brand/marks";
import {
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

describe("marks (src/app/brand/marks.ts)", () => {
  it("have a 100% shape and a 70% one, and go solid at 16px", () => {
    for (const id of MARK_IDS) {
      const at = (size: number) =>
        drawMark(id, size).layers.flatMap((l) =>
          l.kind === "path" ? [l.opacity] : [],
        );
      expect(at(32).sort(), id).toEqual([0.7, 1]);
      expect(at(16), id).toEqual([1, 1]);
    }
  });

  it("put the offset 2px out on the page and none on an app icon", () => {
    // In the sizes the app uses; the 18-unit grid draws in a 19-unit view.
    for (const size of [20, 28, 40]) {
      const offset = drawMark("chat", size).layers.find(
        (l) => l.role === "offset",
      );
      if (offset?.kind !== "rect") throw new Error("No offset");
      expect((offset.x - 1) * (size / 19)).toBeCloseTo((2 * 18) / 19);
    }
    expect(
      drawMark("umbrella", 180, "bleed").layers.some(
        (l) => l.role === "offset",
      ),
    ).toBe(false);
  });
});
