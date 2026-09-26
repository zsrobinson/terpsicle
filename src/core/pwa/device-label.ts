// "iPhone · Safari": how a device with push on is listed in
// /settings/notifications (V2 §6.2, `push_subscriptions.user_agent_label`).
// Stringified into /sw.js too (it re-saves a subscription that changed), so
// it must be self-contained: no imports, no references to anything else.

/** A short, human name for the device and browser behind a user agent. */
export function deviceLabel(userAgent: string, maxTouchPoints = 0): string {
  const device = /\biPhone\b/.test(userAgent)
    ? "iPhone"
    : /\biPad\b/.test(userAgent) ||
        (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)
      ? "iPad"
      : /\bAndroid\b/.test(userAgent)
        ? "Android"
        : /\bCrOS\b/.test(userAgent)
          ? "Chromebook"
          : /\bMacintosh\b/.test(userAgent)
            ? "Mac"
            : /\bWindows\b/.test(userAgent)
              ? "Windows"
              : /\bLinux\b/.test(userAgent)
                ? "Linux"
                : "Device";
  const browser = /\b(Edg|EdgA|EdgiOS)\//.test(userAgent)
    ? "Edge"
    : /\b(OPR|OPiOS)\//.test(userAgent)
      ? "Opera"
      : /\bSamsungBrowser\//.test(userAgent)
        ? "Samsung Internet"
        : /\b(Firefox|FxiOS)\//.test(userAgent)
          ? "Firefox"
          : /\b(Chrome|CriOS)\//.test(userAgent)
            ? "Chrome"
            : /\bSafari\//.test(userAgent)
              ? "Safari"
              : "Browser";
  return `${device} · ${browser}`;
}
