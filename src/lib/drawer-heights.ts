import type { DrawerSnap } from "~/core/schema";

// The phone drawer's heights, apart from the drawer itself
// (~/components/workbench/drawer.tsx, on Base UI's Drawer), which loads only
// on phones: the shell and the calendar size themselves around it on every
// screen. Where it rests is on `<html data-drawer-snap>` while it's up.

/** Handle + tab strip + the panel's header line. */
export const PEEK_HEIGHT = 124;
export const TOP_BAR_HEIGHT = 48;

/**
 * Under this height (a laptop at 400% zoom is 256px), half the screen can't
 * show a panel under the drawer's tabs, so "half" opens it all the way.
 */
const SHORT_VIEWPORT = 480;

export function snapHeights(viewport: number): Record<DrawerSnap, number> {
  const full = viewport - TOP_BAR_HEIGHT;
  return {
    peek: PEEK_HEIGHT,
    half: viewport < SHORT_VIEWPORT ? full : Math.round(viewport * 0.5),
    full,
  };
}
