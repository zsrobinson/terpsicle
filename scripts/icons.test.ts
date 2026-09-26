import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";
import { THEME_COLORS } from "~/app/pwa-head";
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

describe("app icons", () => {
  it("read the tile from the source mark", () => {
    expect(mark.tile).toMatchObject({ width: 16, height: 16 });
    expect(mark.tile.fill).toMatch(/^#/);
    expect(mark.inner).not.toContain("<title>");
  });

  it("are all generated, at their sizes (pnpm tsx scripts/icons.ts)", () => {
    for (const spec of ICONS) {
      const file = publicFile(spec.file);
      expect(existsSync(file), spec.file).toBe(true);
      expect(pngSize(readFileSync(file)), spec.file).toEqual({
        width: spec.size,
        height: spec.size,
      });
    }
  });

  it("are the current mark: regenerating changes nothing", () => {
    for (const spec of ICONS)
      expect(
        renderPng(iconSvg(mark, spec), spec.size).equals(
          readFileSync(publicFile(spec.file)),
        ),
        `${spec.file} is stale: run pnpm tsx scripts/icons.ts`,
      ).toBe(true);
  });

  it("fill every corner of the full-bleed icons, and leave the others clear", () => {
    const opaque = (spec: (typeof ICONS)[number]) =>
      pixel(iconSvg(mark, spec), spec.size, 0, 0)[3];
    for (const spec of ICONS)
      expect(opaque(spec), spec.file).toBe(
        spec.fit.kind === "full-bleed" ? 255 : 0,
      );
  });

  it("keep the maskable icon's art inside Android's smallest mask", () => {
    // The mask can be a circle 80% as wide as the icon; the tile's own
    // square fits inside it only if the padding is at least 1 / 0.8.
    expect(MASKABLE_PADDING).toBeGreaterThanOrEqual(1 / 0.8);
  });
});

describe("the web app manifest", () => {
  const manifest = JSON.parse(
    readFileSync(publicFile("manifest.webmanifest"), "utf8"),
  ) as {
    name: string;
    start_url: string;
    scope: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it("installs Terpsicle for the whole site, opening the scheduler", () => {
    expect(manifest).toMatchObject({
      name: "Terpsicle",
      start_url: PWA_START_URL,
      scope: "/",
      display: "standalone",
    });
  });

  it("lists the generated icons, including a maskable one", () => {
    const listed = manifest.icons.map((icon) => icon.src.replace(/^\//, ""));
    for (const file of listed)
      expect(existsSync(publicFile(file)), file).toBe(true);
    const sizes = manifest.icons.map((i) => `${i.sizes} ${i.purpose}`);
    expect(sizes).toEqual(
      expect.arrayContaining([
        "192x192 any",
        "512x512 any",
        "512x512 maskable",
      ]),
    );
  });

  describe("colors", () => {
    // The installed app's colors come from the theme tokens, so a token
    // change that forgets the manifest or the head fails here.
    const styles = readFileSync(path.join(ROOT, "src/styles.css"), "utf8");
    /** `--bg` inside the first block that starts with `selector {`. */
    const bgToken = (selector: string) => {
      const start = styles.indexOf(`\n${selector} {`);
      const block = styles.slice(start, styles.indexOf("}", start));
      return /--bg:\s*([^;]+);/.exec(block)?.[1]?.trim();
    };

    it("match the page background in each theme (the head's theme-color)", () => {
      expect(bgToken(":root")).toBe(THEME_COLORS.light);
      expect(bgToken(".dark")).toBe(THEME_COLORS.dark);
    });

    it("start the manifest in the light theme (it has no dark one)", () => {
      expect(manifest.theme_color).toBe(THEME_COLORS.light);
      expect(manifest.background_color).toBe(THEME_COLORS.light);
    });
  });
});

describe("the service worker's precache list", () => {
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
