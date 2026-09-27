// Theme: follows the system unless the person picked one (in the account
// menu, on every page). The head script runs before first paint, so there's
// no flash; it reads the localStorage copy, which is the source of truth:
// every page can change the theme, and only the scheduler loads `UiPrefs`.

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

/** The theme picked on any page, or "system" (also on the server). */
export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Applies a theme picked in the app, and mirrors it to localStorage so the
 * head script paints the right theme before the app loads next time.
 * `UiPrefs.theme` in IndexedDB follows it (app.tsx). The head script's media
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

// Who's showing the theme (the account menu's radio, the toggle's icon, the
// scheduler's UI store). No store here: every page loads this, and the
// scheduler's stores load only with /schedule (scripts/check-bundle.ts).
const listeners = new Set<() => void>();

/** Applies and saves a theme picked on any page, and tells whoever shows it. */
export function setThemePreference(pref: ThemePreference): void {
  applyThemePreference(pref);
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`: a change here, or in another tab. */
export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
