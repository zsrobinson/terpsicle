import { THEME_COLORS } from "virtual:terpsicle/theme-colors";

// The document head's installable-app tags (src/routes/__root.tsx, V2 §3.1):
// the web app manifest, iOS's Home Screen tags, and the browser's toolbar
// color in each theme. The manifest and these colors are built from the
// theme tokens in src/styles.css (scripts/pwa-manifest.ts); the icons from
// the umbrella mark (`pnpm tsx scripts/build-icons.ts`).

export const MANIFEST_URL = "/manifest.webmanifest";

/**
 * The browser's toolbar color, per theme. Rendered straight into the head
 * (src/routes/__root.tsx): the router's head tags keep one meta per name,
 * and these are two. `media` follows the system; a picked theme rewrites it
 * (syncThemeColor, src/lib/theme.ts), which finds each by its `scheme`.
 */
export const themeColorMeta = [
  {
    scheme: "light",
    content: THEME_COLORS.light,
    media: "(prefers-color-scheme: light)",
  },
  {
    scheme: "dark",
    content: THEME_COLORS.dark,
    media: "(prefers-color-scheme: dark)",
  },
] as const;

export const pwaMeta = [
  // iOS: open from the Home Screen without Safari's bars, named "Terpsicle".
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "mobile-web-app-capable", content: "yes" },
  // "default": the installed app starts below the status bar, which takes
  // the theme-color of the picked theme (src/lib/theme.ts), so its words are
  // dark on paper and light on black. "black-translucent" would run the bar
  // under it, but its words are always white: unreadable on light paper
  // (docs/decisions.md, "The status bar stays default").
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
  { name: "apple-mobile-web-app-title", content: "Terpsicle" },
];

// The apple-touch icon is linked with the favicons (src/routes/__root.tsx).
export const pwaLinks = [{ rel: "manifest", href: MANIFEST_URL }];
