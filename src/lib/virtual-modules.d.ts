// Modules the build makes up (vite.config.ts).

/** The build's short commit, or "dev" (vite.config.ts; absent in tests). */
declare const __APP_VERSION__: string | undefined;

/** `--bg` in each theme, from src/styles.css (scripts/pwa-manifest.ts). */
declare module "virtual:terpsicle/theme-colors" {
  export const THEME_COLORS: { light: string; dark: string };
}

/**
 * Each inline head script's text, built from src/lib/inline-scripts.ts
 * (scripts/inline-scripts.ts). Render these, never the source strings: the
 * Worker's CSP allows exactly this text.
 */
declare module "virtual:terpsicle/inline-scripts" {
  export const INLINE_SCRIPTS: Readonly<
    Record<import("./inline-scripts").InlineScriptName, string>
  >;
}

/**
 * The router's loading, failure and 404 states' files, for pages other than
 * `/` to preload (scripts/pwa-precache.ts). Filled only in the Worker's
 * build, which renders the head; empty in dev and in the browser's build.
 */
declare module "virtual:terpsicle/route-states-preload" {
  export const ROUTE_STATES_PRELOAD: readonly string[];
}
