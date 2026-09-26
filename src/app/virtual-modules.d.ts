// Modules the build makes up (vite.config.ts).

/** `--bg` in each theme, from src/styles.css (scripts/pwa-manifest.ts). */
declare module "virtual:terpsicle/theme-colors" {
  export const THEME_COLORS: { light: string; dark: string };
}
