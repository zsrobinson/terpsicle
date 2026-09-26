import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTokens } from "~/app/brand/css-tokens";
import {
  NOTIFICATION_BADGE,
  NOTIFICATION_ICON,
  PWA_START_URL,
} from "~/core/schema";
import { BADGE, PNG_ICONS } from "./build-icons";
import type { BundleGraph } from "./bundle-graph";
import { ROOT } from "./lib/source-files";
import { themeColors, webManifest } from "./pwa-manifest";
import { shellFiles } from "./pwa-precache";

// The installable app's files. The icons themselves are the brand's
// (scripts/build-icons.ts, from src/app/brand/marks.ts; build-icons.test.ts
// keeps them current); this holds the manifest and the service worker to
// them.

const publicFile = (file: string) => path.join(ROOT, "public", file);
const styles = readFileSync(path.join(ROOT, "src/styles.css"), "utf8");

describe("the web app manifest (scripts/pwa-manifest.ts)", () => {
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

  it("lists icons build-icons.ts draws, at their sizes, one of them maskable", () => {
    const drawn = new Map(PNG_ICONS.map((icon) => [`/${icon.file}`, icon]));
    expect(manifest.icons.map((i) => i.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);
    for (const listed of manifest.icons) {
      const icon = drawn.get(listed.src);
      expect(icon, listed.src).toBeDefined();
      expect(listed.sizes).toBe(`${icon?.size}x${icon?.size}`);
      expect(listed.purpose === "maskable").toBe(icon?.variant === "maskable");
      expect(existsSync(publicFile(listed.src.slice(1))), listed.src).toBe(
        true,
      );
    }
  });

  it("takes its colors from the Ink page background", () => {
    const themes = readTokens(styles);
    expect(colors).toEqual({ light: themes.light.bg, dark: themes.dark.bg });
    expect(manifest.theme_color).toBe(colors.light);
    expect(manifest.background_color).toBe(colors.light);
  });

  it("says which token is missing", () => {
    expect(() => themeColors(":root {\n  --fg: #000;\n}\n")).toThrow(
      /No token --bg|no --bg/,
    );
  });
});

describe("the service worker's icons (src/server/service-worker.ts)", () => {
  it("are drawn by build-icons.ts", () => {
    const drawn = new Set([...PNG_ICONS, BADGE].map((icon) => `/${icon.file}`));
    expect(drawn.has(NOTIFICATION_ICON)).toBe(true);
    expect(drawn.has(NOTIFICATION_BADGE)).toBe(true);
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
