// Theme: follows the system unless the person picked one (the toggle is at
// the bottom of the rail). The head script runs before first paint, so
// there's no flash; it reads a localStorage mirror of `UiPrefs.theme`.

export const THEME_STORAGE_KEY = "terpsicle:theme";

export type ThemePreference = "system" | "light" | "dark";

// Stringified into the document head, so it must be self-contained: no
// imports, no references to anything else in this module.
function applyTheme(storageKey: string) {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const read = () => {
    try {
      return window.localStorage.getItem(storageKey) ?? "system";
    } catch {
      // Storage can throw (blocked cookies, private modes): follow the system.
      return "system";
    }
  };
  const apply = () => {
    const pref = read();
    const dark = pref === "dark" || (pref !== "light" && media.matches);
    root.classList.toggle("dark", dark);
  };
  apply();
  media.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) apply();
  });
}

export const themeInitScript = `(${applyTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)});`;

/**
 * Applies a theme picked in the app, and mirrors it to localStorage so the
 * head script paints the right theme before the app loads next time. The
 * source of truth is `UiPrefs.theme` in IndexedDB. The head script's media
 * listener keeps "system" following the OS.
 */
export function applyThemePreference(pref: ThemePreference): void {
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
