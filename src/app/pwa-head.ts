import { THEME_COLORS } from "virtual:terpsicle/theme-colors";

// The document head's installable-app tags (src/routes/__root.tsx, V2 §3.1):
// the web app manifest, iOS's Home Screen tags, and the browser's toolbar
// color in each theme. The manifest and these colors are built from the
// theme tokens in src/styles.css (scripts/pwa-manifest.ts); the icons from
// public/favicon.svg (`pnpm tsx scripts/icons.ts`).

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
  // iOS: open from the Home Screen without Safari's bars, named "Terpsicle".
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
