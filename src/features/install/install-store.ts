import { create } from "zustand";
import { track } from "~/app/analytics";
import {
  type InstallMethod,
  installMethod,
  neverOfferInstall,
  recordInstallOffer,
  shouldOfferInstall,
} from "~/core/install";
import type { InstallReason } from "~/core/schema";
import { takeStashedInstallPrompt } from "./install-capture";
import {
  markOfferedThisSession,
  readInstallPrefs,
  wasOfferedThisSession,
  writeInstallPrefs,
} from "./install-prefs";

// The install prompt's state and its one public trigger, `offerInstall`.
// Chrome, Edge and Android hand us their install prompt as a
// `beforeinstallprompt` event, which we keep (so they show no bar of their
// own) and replay from our dialog. iOS has no such event; the dialog shows
// the Share → Add to Home Screen steps instead.

/** Chrome's install prompt event (not in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Why the dialog is open: a key moment, or the "Install app" entry. */
export type InstallOpenedFrom = InstallReason | "menu";

interface InstallState {
  /** The browser's install prompt, kept until used (it works once). */
  deferred: BeforeInstallPromptEvent | null;
  /** Installed from this tab (`appinstalled`); the tab itself stays a browser tab. */
  installed: boolean;
  open: InstallOpenedFrom | null;
}

export const useInstall = create<InstallState>(() => ({
  deferred: null,
  installed: false,
  open: null,
}));

const DISPLAY_MODES = [
  "standalone",
  "fullscreen",
  "minimal-ui",
  "window-controls-overlay",
];

/** Running as the installed app (any display mode but a browser tab). */
export function isStandalone(win: Window = window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean })
    .standalone;
  return (
    iosStandalone === true ||
    DISPLAY_MODES.some(
      (mode) => win.matchMedia?.(`(display-mode: ${mode})`).matches === true,
    )
  );
}

/** How this browser can install the app right now, or null. */
export function currentInstallMethod(
  state: Pick<InstallState, "deferred" | "installed"> = useInstall.getState(),
  win: Window = window,
): InstallMethod | null {
  if (state.installed) return null;
  return installMethod({
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(win),
    canPrompt: state.deferred !== null,
  });
}

/** For the "Install app" entry: re-renders when the browser offers a prompt. */
export function useInstallMethod(): InstallMethod | null {
  const deferred = useInstall((s) => s.deferred);
  const installed = useInstall((s) => s.installed);
  return currentInstallMethod({ deferred, installed });
}

/**
 * Keeps the browser's install prompt for our dialog. Call once, as early as
 * possible: the event fires soon after load, whether or not anything is
 * listening. Returns a function that stops listening.
 */
export function captureInstallPrompt(win: Window = window): () => void {
  const onPrompt = (event: Event) => {
    // No mini-infobar of the browser's own (DESIGN §5: no banners).
    event.preventDefault();
    useInstall.setState({ deferred: event as BeforeInstallPromptEvent });
  };
  const onInstalled = () =>
    useInstall.setState({ deferred: null, installed: true, open: null });
  // The head script may have caught it before this ran (install-capture.ts).
  const stashed = takeStashedInstallPrompt(win);
  if (stashed)
    useInstall.setState({ deferred: stashed as BeforeInstallPromptEvent });
  win.addEventListener("beforeinstallprompt", onPrompt);
  win.addEventListener("appinstalled", onInstalled);
  return () => {
    win.removeEventListener("beforeinstallprompt", onPrompt);
    win.removeEventListener("appinstalled", onInstalled);
  };
}

/**
 * Offers to install the app at a key moment. Other features call it right
 * after the moment happens:
 *
 *   offerInstall("enabled-alerts")   // a seat alert was turned on
 *   offerInstall("first-sign-in")    // signed in for the first time
 *   offerInstall("joined-chat")      // joined a class chat
 *
 * It opens the dialog only where installing works, never in the installed
 * app, at most once a session, not again for 30 days after it's shown, and
 * never after "Don't ask again" (`shouldOfferInstall` in ~/core/install).
 * Returns whether it opened.
 */
export function offerInstall(
  reason: InstallReason,
  now: Date = new Date(),
): boolean {
  if (typeof window === "undefined") return false;
  const prefs = readInstallPrefs();
  const offer = shouldOfferInstall({
    method: currentInstallMethod(),
    prefs,
    now,
    offeredThisSession:
      wasOfferedThisSession() || useInstall.getState().open !== null,
  });
  if (!offer) return false;
  writeInstallPrefs(recordInstallOffer(prefs, now));
  markOfferedThisSession();
  useInstall.setState({ open: reason });
  track("install_prompt_shown", { reason });
  return true;
}

/** The "Install app" entry: opens the dialog whenever installing works. */
export function openInstall(): void {
  if (currentInstallMethod() === null) return;
  useInstall.setState({ open: "menu" });
  track("install_prompt_shown", { reason: "menu" });
}

/** "Not now" (or Esc), "Don't ask again", and "Done" after the iOS steps. */
export function closeInstall(answer: "not-now" | "never" | "done"): void {
  const from = useInstall.getState().open;
  if (from === null) return;
  if (answer === "never")
    writeInstallPrefs(neverOfferInstall(readInstallPrefs()));
  useInstall.setState({ open: null });
  track("install_prompt_answered", { reason: from, answer });
}

/**
 * Replays the browser's install prompt from the dialog's Install button.
 * The dialog closes either way; declining the browser's prompt counts as
 * "Not now".
 */
export async function promptInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const { deferred, open } = useInstall.getState();
  if (!deferred) return "unavailable";
  // A prompt event works once; Chrome sends a fresh one if it's still wanted.
  useInstall.setState({ deferred: null });
  let outcome: "accepted" | "dismissed";
  try {
    await deferred.prompt();
    outcome = (await deferred.userChoice).outcome;
  } catch {
    // Already used, or the browser changed its mind: nothing to install now.
    useInstall.setState({ open: null });
    return "unavailable";
  }
  useInstall.setState({
    open: null,
    ...(outcome === "accepted" ? { installed: true } : {}),
  });
  if (open !== null)
    track("install_prompt_answered", {
      reason: open,
      answer: outcome === "accepted" ? "installed" : "declined",
    });
  return outcome;
}
