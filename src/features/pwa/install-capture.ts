// Chrome fires `beforeinstallprompt` once, soon after load, and doesn't wait
// for the app's scripts. An inline head script (install-prompt-script.ts)
// catches it first, keeps it on `window`, and stops the browser's own install
// bar (DESIGN §5: no banners). `captureInstallPrompt` (install-store.ts)
// picks it up from there.

/** Where the head script keeps the event until the app takes it. */
export const INSTALL_PROMPT_STASH = "__terpsicleInstallPrompt";

/** The event the head script caught, if any. */
export function takeStashedInstallPrompt(win: Window): Event | null {
  const stash = win as unknown as Record<string, unknown>;
  const event = stash[INSTALL_PROMPT_STASH];
  return event instanceof Event ? event : null;
}
