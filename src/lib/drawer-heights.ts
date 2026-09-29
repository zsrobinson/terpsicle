import type { DrawerSnap } from "~/core/schema";

// The phone drawer's heights, apart from the drawer itself
// (~/components/workbench/drawer.tsx, on Base UI's Drawer), which loads only
// on phones: the shell and the calendar size themselves around it on every
// screen. Where it rests is on `<html data-drawer-snap>` while it's up.

/**
 * Handle + tab strip + the panel's header line. At peek the drawer is this
 * much plus the home indicator's inset (`--safe-bottom`), which it keeps
 * clear: `calc(124px + var(--safe-bottom))` in CSS.
 */
export const PEEK_HEIGHT = 124;
/** The family bar, under the status bar's inset (`--safe-top`). */
export const TOP_BAR_HEIGHT = 48;

/**
 * Under this height (a laptop at 400% zoom is 256px), half the screen can't
 * show a panel under the drawer's tabs, so "half" opens it all the way.
 */
const SHORT_VIEWPORT = 480;

/** The safe areas' insets in px (styles.css): 0 where there are none. */
export interface SafeInsets {
  top: number;
  bottom: number;
}

/**
 * How tall the drawer is at each snap, for a layout viewport `viewport` px
 * tall: full reaches the family bar, under the status bar's inset; peek
 * keeps its strip above the home indicator's.
 */
export function snapHeights(
  viewport: number,
  safe: Partial<SafeInsets> = {},
): Record<DrawerSnap, number> {
  const full = viewport - TOP_BAR_HEIGHT - (safe.top ?? 0);
  return {
    peek: PEEK_HEIGHT + (safe.bottom ?? 0),
    half: viewport < SHORT_VIEWPORT ? full : Math.round(viewport * 0.5),
    full,
  };
}
