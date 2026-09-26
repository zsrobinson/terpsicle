import { DEFAULT_INSTALL_PROMPT_STATE } from "~/core/pwa";
import {
  INSTALL_PROMPT_STORAGE_KEY,
  type InstallPromptState,
  InstallPromptStateSchema,
} from "~/core/schema";

// What this browser remembers about the install prompt (V2 §3.4, DATA.md
// §5.2): dismissals in localStorage ("already shown" for this tab is in
// install-session.ts). Storage can be blocked (private modes, cookie
// settings); then the prompt stays away, since we couldn't remember a
// "Not now".

/** The saved state, the default if nothing (or nothing valid) is saved, or null if storage is blocked. */
export function readInstallState(): InstallPromptState | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return DEFAULT_INSTALL_PROMPT_STATE;
  try {
    const parsed = InstallPromptStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_INSTALL_PROMPT_STATE;
  } catch {
    return DEFAULT_INSTALL_PROMPT_STATE;
  }
}

export function writeInstallState(state: InstallPromptState): void {
  try {
    window.localStorage.setItem(
      INSTALL_PROMPT_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Full or blocked: nothing more to do, and reading fails the same way.
  }
}
