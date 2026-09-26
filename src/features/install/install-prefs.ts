import { DEFAULT_INSTALL_PROMPT_PREFS } from "~/core/install";
import {
  INSTALL_PROMPT_STORAGE_KEY,
  type InstallPromptPrefs,
  InstallPromptPrefsSchema,
} from "~/core/schema";

// What this browser remembers about the install prompt (docs/DATA.md §5.2):
// when it last opened on its own and "Don't ask again" in localStorage, and
// "already offered" for this tab in sessionStorage. Storage can be blocked
// (private modes, cookie settings), so every access is guarded; without it
// the prompt falls back to at most once per page load.

/** sessionStorage: set once the prompt has opened on its own in this tab. */
export const INSTALL_OFFERED_SESSION_KEY = "terpsicle:install-offered";

let offeredInMemory = false;

function local(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readInstallPrefs(): InstallPromptPrefs {
  try {
    const raw = local()?.getItem(INSTALL_PROMPT_STORAGE_KEY);
    if (!raw) return DEFAULT_INSTALL_PROMPT_PREFS;
    const parsed = InstallPromptPrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_INSTALL_PROMPT_PREFS;
  } catch {
    return DEFAULT_INSTALL_PROMPT_PREFS;
  }
}

export function writeInstallPrefs(prefs: InstallPromptPrefs): void {
  try {
    local()?.setItem(INSTALL_PROMPT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Full or blocked: the once-a-session limit still holds.
  }
}

export function wasOfferedThisSession(): boolean {
  if (offeredInMemory) return true;
  try {
    return session()?.getItem(INSTALL_OFFERED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOfferedThisSession(): void {
  offeredInMemory = true;
  try {
    session()?.setItem(INSTALL_OFFERED_SESSION_KEY, "1");
  } catch {
    // Kept in memory for this page load.
  }
}

/** Tests only: forget the in-memory flag. */
export function resetOfferedInMemory(): void {
  offeredInMemory = false;
}
