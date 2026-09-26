import type { InstallPromptState } from "../schema";
import type { InstallMethod } from "./install";

// When a key moment may open the install prompt (V2 §3.4, the owner's "not
// too annoying"): only where installing works, never once installed, at most
// once a session, not within 90 days of being dismissed, and never after
// two dismissals. The "Install app" menu item skips everything but the first
// two.

/** Days after a dismissal before a key moment may ask again. */
export const INSTALL_COOLDOWN_DAYS = 90;
/** Dismissals after which only the menu item opens it. */
export const MAX_INSTALL_DISMISSALS = 2;
const DAY_MS = 86_400_000;

export const DEFAULT_INSTALL_PROMPT_STATE: InstallPromptState = {
  dismissals: 0,
  lastDismissedAt: null,
};

/**
 * Whether a key moment (`requestInstallPrompt`) may open the prompt now.
 * `state` is null when storage can't be read: then it doesn't.
 */
export function shouldOfferInstall({
  method,
  state,
  now,
  shownThisSession,
}: {
  method: InstallMethod | null;
  state: InstallPromptState | null;
  now: Date;
  shownThisSession: boolean;
}): boolean {
  if (method === null || state === null || shownThisSession) return false;
  if (state.dismissals >= MAX_INSTALL_DISMISSALS) return false;
  if (state.lastDismissedAt === null) return true;
  const last = Date.parse(state.lastDismissedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= INSTALL_COOLDOWN_DAYS * DAY_MS;
}

/** The state after "Not now" (or Esc, "Got it", or declining the browser's prompt). */
export function recordInstallDismissal(
  state: InstallPromptState,
  now: Date,
): InstallPromptState {
  return {
    dismissals: state.dismissals + 1,
    lastDismissedAt: now.toISOString(),
  };
}

/** What installing gives you, in plain words (V2 §3.4). */
export const INSTALL_BENEFITS = [
  "Get notified when a seat opens or a classmate replies",
  "Open it from your home screen, like an app",
  "Use the full screen, without browser bars",
] as const;
