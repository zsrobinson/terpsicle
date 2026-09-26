// The document head's installable-app tags (src/routes/__root.tsx): the web
// app manifest (public/manifest.webmanifest), iOS's home-screen tags, and
// the browser's toolbar color in each theme. Icons: `pnpm tsx
// scripts/icons.ts` rebuilds them from public/favicon.svg.

/**
 * `--bg` in each theme (src/styles.css). A test holds them to the tokens and
 * to the manifest's colors.
 */
export const THEME_COLORS = { light: "#fcfcfd", dark: "#0a0a0c" } as const;

export const MANIFEST_URL = "/manifest.webmanifest";
export const APPLE_TOUCH_ICON_URL = "/apple-touch-icon.png";

/**
 * The browser's toolbar color, per system theme. Rendered straight into the
 * head (src/routes/__root.tsx): the router's head tags keep one meta per
 * name, and these are two.
 */
export const themeColorMeta = [
  { content: THEME_COLORS.light, media: "(prefers-color-scheme: light)" },
  { content: THEME_COLORS.dark, media: "(prefers-color-scheme: dark)" },
];

export const pwaMeta = [
  // iOS: open from the home screen without Safari's bars, named "Terpsicle".
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "mobile-web-app-capable", content: "yes" },
  // "default": the page starts below the status bar, which follows the page
  // in either theme. "black-translucent" would draw the top bar under it.
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  { name: "apple-mobile-web-app-title", content: "Terpsicle" },
];

export const pwaLinks = [
  { rel: "manifest", href: MANIFEST_URL },
  { rel: "apple-touch-icon", href: APPLE_TOUCH_ICON_URL, sizes: "180x180" },
];
