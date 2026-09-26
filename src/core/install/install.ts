import type { InstallPromptPrefs } from "../schema";

// When to offer installing the app (the owner's "not too annoying"): only
// where installing works, never once installed, at most once a session,
// then not again for a month, and never after "Don't ask again".

/** How this browser installs: its own prompt, or steps we show (iOS). */
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

/** Days between offers after one is shown and closed. */
export const INSTALL_COOLDOWN_DAYS = 30;
const DAY_MS = 86_400_000;

export const DEFAULT_INSTALL_PROMPT_PREFS: InstallPromptPrefs = {
  lastOfferedAt: null,
  never: false,
};

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return (
    /\b(iPhone|iPad|iPod)\b/.test(userAgent) ||
    (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
  );
}

/**
 * Safari on iOS, where Share → Add to Home Screen installs the app. Other
 * browsers on iOS name themselves (CriOS, FxiOS, …) and put Share elsewhere,
 * and in-app browsers (Instagram, Gmail's) can't add to the home screen at
 * all, so the steps would be wrong there.
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
 * Whether a key moment (`offerInstall`) should open the prompt now. The
 * "Install app" entry in settings ignores all of this but `method`.
 */
export function shouldOfferInstall({
  method,
  prefs,
  now,
  offeredThisSession,
}: {
  method: InstallMethod | null;
  prefs: InstallPromptPrefs;
  now: Date;
  offeredThisSession: boolean;
}): boolean {
  if (method === null || offeredThisSession || prefs.never) return false;
  if (prefs.lastOfferedAt === null) return true;
  const last = Date.parse(prefs.lastOfferedAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= INSTALL_COOLDOWN_DAYS * DAY_MS;
}

/** Prefs after the prompt opens on its own: the cooldown starts now. */
export function recordInstallOffer(
  prefs: InstallPromptPrefs,
  now: Date,
): InstallPromptPrefs {
  return { ...prefs, lastOfferedAt: now.toISOString() };
}

/** Prefs after "Don't ask again". */
export function neverOfferInstall(
  prefs: InstallPromptPrefs,
): InstallPromptPrefs {
  return { ...prefs, never: true };
}

/** Phones and tablets have a home screen; computers have a dock or taskbar. */
export function installDevice(
  userAgent: string,
  maxTouchPoints: number,
): "mobile" | "desktop" {
  return isIos(userAgent, maxTouchPoints) || /\bAndroid\b/.test(userAgent)
    ? "mobile"
    : "desktop";
}

/** What installing gives you, in plain words (SPEC §3.13). */
export function installBenefits(
  device: "mobile" | "desktop",
): readonly [notify: string, launch: string, window: string] {
  return [
    "Get notified when your class chat or a seat alert needs you",
    device === "mobile"
      ? "Open Terpsicle from your home screen"
      : "Open Terpsicle from your dock or taskbar",
    device === "mobile"
      ? "Full screen, no browser bars"
      : "Its own window, no browser bars",
  ];
}
