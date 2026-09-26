// "Already shown" for this tab, in sessionStorage (V2 §3.4: at most once a
// session). Apart from install-prefs.ts, since the "Install app" entry needs
// only this and loads with the scheduler (scripts/check-bundle.ts).

/** sessionStorage: set once the prompt has opened in this tab. */
export const INSTALL_SHOWN_SESSION_KEY = "terpsicle:install-shown";

/** Whether the prompt opened in this tab already; null if storage is blocked. */
export function wasShownThisSession(): boolean | null {
  try {
    return window.sessionStorage.getItem(INSTALL_SHOWN_SESSION_KEY) === "1";
  } catch {
    return null;
  }
}

export function markShownThisSession(): void {
  try {
    window.sessionStorage.setItem(INSTALL_SHOWN_SESSION_KEY, "1");
  } catch {
    // Blocked: then wasShownThisSession() is null, which also means "don't show".
  }
}
