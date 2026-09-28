import { SIDEBAR_WIDTH } from "~/core/schema";

// The desktop sidebar's width lives in `--sidebar-width` on the document root;
// `w-sidebar` (styles.css) reads it. The source of truth is
// `UiPrefs.sidebarWidth` in IndexedDB, which loads after first paint, so a
// localStorage mirror lets a head script set the width before the app draws,
// the same way the theme avoids a flash (theme.ts).

export const SIDEBAR_WIDTH_STORAGE_KEY = "terpsicle:sidebar-width";

/**
 * Below 1024px (a tablet) the default 360px leaves the calendar about 400px,
 * so an untouched sidebar takes the minimum there. A width the user chose
 * wins everywhere. styles.css has the same breakpoint for the first paint.
 */
export const COMPACT_SIDEBAR_QUERY = "(max-width: 1023px)";

/** The width to draw: the saved one, unless it's the default on a tablet. */
export function shownSidebarWidth(saved: number, compact: boolean): number {
  return compact && saved === SIDEBAR_WIDTH.default ? SIDEBAR_WIDTH.min : saved;
}

/** Sets the width the layout uses, without saving it (every frame of a drag). */
export function setSidebarWidthVar(px: number): void {
  document.documentElement.style.setProperty("--sidebar-width", `${px}px`);
}

/**
 * Sets the width and mirrors the saved one for the next visit's first paint.
 * `shown` differs from `px` only for the default on a tablet.
 */
export function applySidebarWidth(px: number, shown = px): void {
  setSidebarWidthVar(shown);
  try {
    if (px === SIDEBAR_WIDTH.default)
      window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    else window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(px));
  } catch {
    // Storage blocked: the width still applies for this visit.
  }
}

// Stringified into the document head, so it must be self-contained.
function applyStoredSidebarWidth(key: string, min: number, max: number) {
  try {
    const px = Number(window.localStorage.getItem(key));
    if (Number.isInteger(px) && px >= min && px <= max)
      document.documentElement.style.setProperty("--sidebar-width", `${px}px`);
  } catch {
    // Storage blocked: the default width from styles.css.
  }
}

export const sidebarWidthInitScript = `(${applyStoredSidebarWidth.toString()})(${JSON.stringify(SIDEBAR_WIDTH_STORAGE_KEY)},${SIDEBAR_WIDTH.min},${SIDEBAR_WIDTH.max});`;
