import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { PWA_START_URL } from "~/core/schema";
import type { BundleGraph } from "./bundle-graph";
import {
  ICONS,
  iconSvg,
  MASKABLE_PADDING,
  parseMark,
  renderPng,
} from "./icons";
import { ROOT } from "./lib/source-files";
import { themeColors, webManifest } from "./pwa-manifest";
import { shellFiles } from "./pwa-precache";

const publicFile = (file: string) => path.join(ROOT, "public", file);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The RGBA pixel at (x, y) of a rendered icon. */
function pixel(svg: string, size: number, x: number, y: number): number[] {
  const image = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
  }).render();
  const i = (y * size + x) * 4;
  return [...image.pixels.subarray(i, i + 4)];
}

const mark = parseMark(readFileSync(publicFile("favicon.svg"), "utf8"));
const spec = (file: string) => {
  const found = ICONS.find((icon) => icon.file === file);
  if (!found) throw new Error(`No icon ${file}`);
  return found;
};

describe("app icons (scripts/icons.ts)", () => {
  it("read the tile from the source mark", () => {
    expect(mark.tile).toMatchObject({ width: 16, height: 16 });
    expect(mark.tile.fill).toMatch(/^#/);
    expect(mark.inner).not.toContain("<title>");
    expect(mark.art).not.toContain(mark.tile.fill);
  });

  it("are all generated, at their sizes", () => {
    for (const icon of ICONS) {
      const file = publicFile(icon.file);
      expect(existsSync(file), icon.file).toBe(true);
      expect(pngSize(readFileSync(file)), icon.file).toEqual({
        width: icon.size,
        height: icon.size,
      });
    }
  });

  it("are the current mark: regenerating changes nothing", () => {
    for (const icon of ICONS)
      expect(
        renderPng(iconSvg(mark, icon), icon.size).equals(
          readFileSync(publicFile(icon.file)),
        ),
        `${icon.file} is stale: run pnpm tsx scripts/icons.ts`,
      ).toBe(true);
  });

  it("fill every corner of the full-bleed icons, and leave the others clear", () => {
    for (const icon of ICONS)
      expect(pixel(iconSvg(mark, icon), icon.size, 0, 0)[3], icon.file).toBe(
        icon.fit.kind === "full-bleed" ? 255 : 0,
      );
  });

  it("draw the badge as white art on clear", () => {
    const badge = spec("icons/badge-72.png");
    const svg = iconSvg(mark, badge);
    expect(svg).not.toContain(mark.tile.fill);
    // The first bar's middle, and the empty space between the bars.
    expect(pixel(svg, badge.size, 27, 30)).toEqual([255, 255, 255, 255]);
    expect(pixel(svg, badge.size, 36, 14)[3]).toBe(0);
  });

  it("keep the maskable icon's art inside Android's smallest mask", () => {
    // The mask can be a circle 80% as wide as the icon; the tile's own
    // square fits inside it only if the padding is at least 1 / 0.8.
    expect(MASKABLE_PADDING).toBeGreaterThanOrEqual(1 / 0.8);
  });
});

describe("the web app manifest (scripts/pwa-manifest.ts)", () => {
  const styles = readFileSync(path.join(ROOT, "src/styles.css"), "utf8");
  const colors = themeColors(styles);
  const manifest = webManifest(colors);

  it("installs Terpsicle for the whole site, opening the scheduler", () => {
    expect(manifest).toMatchObject({
      id: "/",
      name: "Terpsicle",
      start_url: PWA_START_URL,
      scope: "/",
      display: "standalone",
    });
    expect(manifest.shortcuts.map((s) => s.url)).toEqual([
      "/schedule",
      "/chat",
      "/reviews",
    ]);
  });

  it("lists the generated icons, including a maskable one", () => {
    const generated = new Set(ICONS.map((icon) => `/${icon.file}`));
    for (const icon of manifest.icons)
      expect(generated.has(icon.src), icon.src).toBe(true);
    expect(manifest.icons.map((i) => [i.sizes, i.purpose ?? "any"])).toEqual([
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ]);
  });

  it("takes its colors from the page background tokens", () => {
    expect(colors).toEqual({ light: "#fcfcfd", dark: "#0a0a0c" });
    expect(manifest.theme_color).toBe(colors.light);
    expect(manifest.background_color).toBe(colors.light);
  });

  it("says which token is missing", () => {
    expect(() => themeColors(":root {\n  --fg: #000;\n}\n")).toThrow(
      /no --bg in :root/,
    );
  });
});

describe("the service worker's precache list (scripts/pwa-precache.ts)", () => {
  const chunk = (imports: string[], modules: string[], css: string[] = []) => ({
    isEntry: false,
    imports,
    dynamicImports: [],
    css,
    modules,
  });
  const graph: BundleGraph = {
    "assets/index.js": {
      ...chunk(["assets/ui.js"], ["src/routes/__root.tsx"]),
      isEntry: true,
    },
    "assets/ui.js": chunk([], ["src/components/ui/button.tsx"]),
    "assets/routes.js": chunk(
      ["assets/ui.js"],
      ["src/routes/index.tsx?tsr-split=component"],
      ["assets/routes.css"],
    ),
    "assets/map.js": chunk(
      ["assets/routes.js"],
      ["node_modules/maplibre-gl/x.js"],
      ["assets/map.css"],
    ),
    "assets/fixtures.js": chunk([], ["src/fixtures/mock/catalog.ts"]),
  };
  const code: Record<string, string> = {
    "assets/index.js": 'link("/assets/styles.css")',
  };

  it("holds the entry, every route's chunk, their imports and their CSS", () => {
    expect(shellFiles(graph, (file) => code[file] ?? "")).toEqual([
      "/assets/index.js",
      "/assets/routes.js",
      "/assets/ui.js",
      "/assets/routes.css",
      "/assets/styles.css",
    ]);
  });
});
