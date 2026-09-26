import type { InstallPromptState } from "../schema";

// When a key moment may open the install prompt (V2 §3.4, the owner's "not
// too annoying"): only where installing works, never once installed, at most
// once a session, not within 90 days of being dismissed, and never after
// two dismissals. The "Install app" menu item skips everything but the first
// two.

/** How this browser installs: its own prompt (Chromium), or steps we show (iOS). */
export type InstallMethod = "prompt" | "ios-steps";

export interface InstallEnvironment {
  userAgent: string;
  /** `navigator.maxTouchPoints`: tells an iPad from a Mac (same user agent). */
  maxTouchPoints: number;
  /** Already running as the installed app (`display-mode: standalone`, …). */
  standalone: boolean;
  /** The browser offered its install prompt (`beforeinstallprompt`), and we kept it. */
  canPrompt: boolean;
}

/** Days after a dismissal before a key moment may ask again. */
export const INSTALL_COOLDOWN_DAYS = 90;
/** Dismissals after which only the menu item opens it. */
export const MAX_INSTALL_DISMISSALS = 2;
const DAY_MS = 86_400_000;

export const DEFAULT_INSTALL_PROMPT_STATE: InstallPromptState = {
  dismissals: 0,
  lastDismissedAt: null,
};

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return (
    /\b(iPhone|iPad|iPod)\b/.test(userAgent) ||
    (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
  );
}

/**
 * Safari on iOS or iPadOS, where Share → Add to Home Screen installs the
 * app. Other iOS browsers name themselves (CriOS, FxiOS, …) and put Share
 * elsewhere, and in-app browsers (Instagram, Gmail's) can't add to the Home
 * Screen at all, so our steps would be wrong there.
 */
export function isIosSafari(
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  return (
    isIos(userAgent, maxTouchPoints) &&
    /\bSafari\//.test(userAgent) &&
    !/\b(CriOS|FxiOS|EdgiOS|OPiOS|GSA|YaBrowser|DuckDuckGo|FBAN|FBAV|Instagram|Line|Snapchat|GoogleApp)\b/.test(
      userAgent,
    )
  );
}

/** How this browser can install the app, or null when it can't (or it's installed). */
export function installMethod(env: InstallEnvironment): InstallMethod | null {
  if (env.standalone) return null;
  if (env.canPrompt) return "prompt";
  if (isIosSafari(env.userAgent, env.maxTouchPoints)) return "ios-steps";
  return null;
}

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

/** For analytics: which kind of install the prompt offered. */
export function installPlatform(method: InstallMethod): "ios" | "chromium" {
  return method === "ios-steps" ? "ios" : "chromium";
}
