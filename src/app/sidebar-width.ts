import { SIDEBAR_WIDTH } from "~/core/schema";

// The desktop sidebar's width lives in `--sidebar-width` on the document root;
// `w-sidebar` (styles.css) reads it. The source of truth is
// `UiPrefs.sidebarWidth` in IndexedDB, which loads after first paint, so a
// localStorage mirror lets a head script set the width before the app draws,
// the same way the theme avoids a flash (theme.ts).

export const SIDEBAR_WIDTH_STORAGE_KEY = "terpsicle:sidebar-width";

/** Sets the width the layout uses, without saving it (every frame of a drag). */
export function setSidebarWidthVar(px: number): void {
  document.documentElement.style.setProperty("--sidebar-width", `${px}px`);
}

/** Sets the width and mirrors it for the next visit's first paint. */
export function applySidebarWidth(px: number): void {
  setSidebarWidthVar(px);
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
