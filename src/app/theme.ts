// Theme: follows the system unless the person picked one (the toggle arrives
// in M3). Runs inline in <head> before first paint, so there's no flash.

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
