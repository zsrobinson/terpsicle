import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
// Relative, not `~/`: vite.config.ts loads this before any alias exists.
import { readTokens } from "../src/app/brand/css-tokens";

// The web app manifest (docs/V2.md §3.1), built from the Ink tokens so a
// brand refresh changes one place: src/styles.css. The build writes
// dist/client/manifest.webmanifest, the dev server answers
// /manifest.webmanifest, and the document head's theme colors come from the
// same tokens (`virtual:terpsicle/theme-colors`, src/app/pwa-head.ts).
// Icons: scripts/build-icons.ts, from src/app/brand/marks.ts.

export const MANIFEST_FILE = "manifest.webmanifest";
export const THEME_COLORS_MODULE = "virtual:terpsicle/theme-colors";
const RESOLVED = `\0${THEME_COLORS_MODULE}`;
const STYLES = "src/styles.css";

export interface ThemeColors {
  light: string;
  dark: string;
}

/** The page background (`--bg`) in each theme, as the app paints it. */
export function themeColors(css: string): ThemeColors {
  const themes = readTokens(css);
  const bg = (theme: "light" | "dark") => {
    const value = themes[theme].bg;
    if (!value) throw new Error(`${STYLES} has no --bg in the ${theme} theme`);
    return value;
  };
  return { light: bg("light"), dark: bg("dark") };
}

export function webManifest(colors: ThemeColors) {
  return {
    id: "/",
    name: "Terpsicle",
    short_name: "Terpsicle",
    description:
      "Plan your UMD classes, read reviews, and chat with your classmates.",
    lang: "en",
    start_url: "/schedule",
    scope: "/",
    display: "standalone",
    // A manifest has one color; the head's theme-color tags follow the
    // system theme.
    background_color: colors.light,
    theme_color: colors.light,
    // Drawn by scripts/build-icons.ts; scripts/pwa.test.ts holds the two
    // lists together.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Schedule", url: "/schedule" },
      { name: "Chat", url: "/chat" },
      { name: "Reviews", url: "/reviews" },
    ],
  };
}

export function pwaManifest(root: string): Plugin {
  const stylesPath = path.join(root, STYLES);
  const colors = () => themeColors(readFileSync(stylesPath, "utf8"));
  const manifest = () => `${JSON.stringify(webManifest(colors()), null, 2)}\n`;
  return {
    name: "terpsicle:pwa-manifest",
    resolveId(id) {
      return id === THEME_COLORS_MODULE ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      // No addWatchFile(styles.css): that makes the stylesheet a CSS node
      // under the root route in dev, and TanStack Start's dev SSR styles then
      // collect it with every file Tailwind scanned, the prototype's CSS in
      // reference/ included (its dark accent is red; axe caught the page
      // repainting from it). hotUpdate below keeps the colors fresh instead.
      return `export const THEME_COLORS = ${JSON.stringify(colors())};\n`;
    },
    hotUpdate({ file }) {
      if (path.resolve(file) !== stylesPath) return;
      // A token edit: the next load reads the new colors. The stylesheet's
      // own update goes ahead as usual.
      const graph = this.environment.moduleGraph;
      const colorsModule = graph.getModuleById(RESOLVED);
      if (colorsModule) graph.invalidateModule(colorsModule);
    },
    configureServer(server) {
      server.middlewares.use(`/${MANIFEST_FILE}`, (_req, res) => {
        res.setHeader("content-type", "application/manifest+json");
        res.end(manifest());
      });
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      this.emitFile({
        type: "asset",
        fileName: MANIFEST_FILE,
        source: manifest(),
      });
    },
  };
}
