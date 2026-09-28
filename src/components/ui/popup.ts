// The look every floating layer shares (menus, context menus, selects,
// popovers), so a row's right-click menu, its ⋯ menu and a select's list are
// one card: Ink's hairline, raised fill, offset shadow and soft gray
// highlight, as they were on Radix (docs/decisions.md, "Base UI for every
// primitive, styled in Ink").

/** A popup's card. */
export const POPUP_CARD =
  "border border-keyline bg-raised text-fg shadow-pop outline-none";

/**
 * Enter and exit: a quick fade from 98% (the `--dur-pop` motion token), from
 * the point it grew out of. Base UI sets the starting and ending styles, and
 * `data-instant` when a close shouldn't animate (a pick, Esc).
 */
export const POPUP_MOTION =
  "origin-(--transform-origin) transition-[opacity,scale] duration-(--dur-pop) ease-(--ease-pop) data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-instant:transition-none";

/** A menu's card: at least 180px wide, scrolling past the screen's edge. */
export const MENU_POPUP = `${POPUP_CARD} ${POPUP_MOTION} min-w-[180px] max-h-(--available-height) overflow-y-auto overflow-x-hidden p-1`;

/** One row of a menu (32px, 44px on phones), highlighted in soft gray. */
export const MENU_ITEM =
  "relative flex min-h-8 max-md:min-h-11 w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-left text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-hover data-disabled:opacity-40 [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** A hairline between groups of items, edge to edge. */
export const MENU_SEPARATOR = "-mx-1 my-1 h-px bg-hairline";

/** Where a positioned layer sits, over the page and its bars. */
export const POPUP_LAYER = "z-50 outline-none";

/**
 * Fixed to the viewport, as Radix placed them: a popup stays by its trigger
 * inside a scrolling panel, and axe measures it as the floating layer it is
 * rather than as page content covering the rows under it.
 */
export const POPUP_POSITION = "fixed" as const;
