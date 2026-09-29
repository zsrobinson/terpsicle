import type { DrawerSnap } from "~/core/schema";

// The phone drawer's heights, apart from the drawer itself
// (~/components/workbench/drawer.tsx, on Base UI's Drawer), which loads only
// on phones: the shell and the calendar size themselves around it on every
// screen. Where it rests is on `<html data-drawer-snap>` while it's up.

/**
 * Handle + tab strip + the panel's header line. At peek the drawer is this
 * much plus the tab bar and the home indicator's inset under it, which it
 * rests on: `calc(124px + var(--tab-bar-height) + var(--safe-bottom))` in
 * CSS.
 */
export const PEEK_HEIGHT = 124;
/** The family bar, under the status bar's inset (`--safe-top`). */
export const TOP_BAR_HEIGHT = 48;
/**
 * The phone's tab bar over the home indicator (~/components/tab-bar):
 * styles.css's `--tab-bar-height` on pages that have it, 0 on the rest.
 */
export const TAB_BAR_HEIGHT = 50;

/**
 * Under this height (a laptop at 400% zoom is 256px), half the screen can't
 * show a panel under the drawer's tabs, so "half" opens it all the way.
 */
const SHORT_VIEWPORT = 480;

/**
 * What covers the screen's edges, in px: the safe areas' insets
 * (styles.css), 0 where there are none, and the tab bar (`tabBar`, its
 * `--tab-bar-height`), 0 where the page has none.
 */
export interface SafeInsets {
  top: number;
  bottom: number;
  tabBar: number;
}

/**
 * How tall the drawer is at each snap, for a layout viewport `viewport` px
 * tall: full reaches the family bar, under the status bar's inset (the tab
 * bar steps aside for it); peek keeps its strip above the tab bar and the
 * home indicator's inset.
 */
export function snapHeights(
  viewport: number,
  safe: Partial<SafeInsets> = {},
): Record<DrawerSnap, number> {
  const full = viewport - TOP_BAR_HEIGHT - (safe.top ?? 0);
  const peek = PEEK_HEIGHT + (safe.tabBar ?? 0) + (safe.bottom ?? 0);
  return {
    peek,
    half: viewport < SHORT_VIEWPORT ? full : Math.round(viewport * 0.5),
    full,
  };
}

/** The tab bar's height on this page, from styles.css: 0 where it has none. */
export function tabBarHeight(): number {
  if (typeof document === "undefined") return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    "--tab-bar-height",
  );
  return Number.parseFloat(value) || 0;
}
