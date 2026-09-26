// Modules the build makes up (vite.config.ts).

/** `--bg` in each theme, from src/styles.css (scripts/pwa-manifest.ts). */
declare module "virtual:terpsicle/theme-colors" {
  export const THEME_COLORS: { light: string; dark: string };
}

/**
 * Each inline head script's text, built from src/app/inline-scripts.ts
 * (scripts/inline-scripts.ts). Render these, never the source strings: the
 * Worker's CSP allows exactly this text.
 */
declare module "virtual:terpsicle/inline-scripts" {
  export const INLINE_SCRIPTS: Readonly<
    Record<import("./inline-scripts").InlineScriptName, string>
  >;
}
