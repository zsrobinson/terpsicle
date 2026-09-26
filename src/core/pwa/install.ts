// Whether and how this browser can install the app (V2 §3.4). When a key
// moment may open the prompt: install-policy.ts.

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

/** For analytics: which kind of install the prompt offered. */
export function installPlatform(method: InstallMethod): "ios" | "chromium" {
  return method === "ios-steps" ? "ios" : "chromium";
}
