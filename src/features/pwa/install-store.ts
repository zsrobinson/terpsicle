import { create } from "zustand";
import { track } from "~/app/analytics";
import {
  type InstallMethod,
  installMethod,
  installPlatform,
  recordInstallDismissal,
  shouldOfferInstall,
} from "~/core/pwa";
import type { InstallTrigger } from "~/core/schema";
import { takeStashedInstallPrompt } from "./install-capture";
import {
  markShownThisSession,
  readInstallState,
  wasShownThisSession,
  writeInstallState,
} from "./install-prefs";

// The install prompt's state and its public trigger, `requestInstallPrompt`
// (V2 §3.4). Chromium hands us its install prompt as a `beforeinstallprompt`
// event, which we keep (so it shows no bar of its own) and replay from our
// dialog's Install button. iOS has no such event; the dialog shows the
// Share → Add to Home Screen steps instead.

/** Chromium's install prompt event (not in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Why the dialog is open: a key moment, or the "Install app" menu item. */
export type InstallOpenedFrom = InstallTrigger | "menu";

interface InstallState {
  /** The browser's install prompt, kept until used (it works once). */
  deferred: BeforeInstallPromptEvent | null;
  /** Installed from this tab (`appinstalled`); the tab itself stays a browser tab. */
  installed: boolean;
  open: { from: InstallOpenedFrom; method: InstallMethod } | null;
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

/** For the "Install app" item: re-renders when the browser offers a prompt. */
export function useInstallMethod(): InstallMethod | null {
  const deferred = useInstall((s) => s.deferred);
  const installed = useInstall((s) => s.installed);
  return currentInstallMethod({ deferred, installed });
}

/**
 * Keeps the browser's install prompt for our dialog, including one the head
 * script caught before the app loaded (install-capture.ts). Call once; it
 * returns a function that stops listening.
 */
export function captureInstallPrompt(win: Window = window): () => void {
  const onPrompt = (event: Event) => {
    // No mini-infobar of the browser's own (DESIGN §5: no banners).
    event.preventDefault();
    useInstall.setState({ deferred: event as BeforeInstallPromptEvent });
  };
  const onInstalled = () => {
    useInstall.setState({ deferred: null, installed: true, open: null });
    track("pwa_installed", {});
  };
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

function show(from: InstallOpenedFrom, method: InstallMethod): void {
  markShownThisSession();
  useInstall.setState({ open: { from, method } });
  track("install_prompt_shown", {
    trigger: from,
    platform: installPlatform(method),
  });
}

/**
 * Asks to show the install prompt at a key moment. Other features call it
 * right after the moment:
 *
 *   requestInstallPrompt("alert-on")        // a seat alert turned on
 *   requestInstallPrompt("first-sign-in")   // the first sign-in on this device
 *   requestInstallPrompt("chat-joined")     // opened one of your chat rooms
 *
 * It opens only where installing works, never in the installed app, at most
 * once a session, not within 90 days of a dismissal, and never after two
 * (`shouldOfferInstall` in ~/core/pwa). Returns whether it opened.
 */
export function requestInstallPrompt(
  trigger: InstallTrigger,
  now: Date = new Date(),
): boolean {
  if (typeof window === "undefined") return false;
  const method = currentInstallMethod();
  const shownThisSession = wasShownThisSession();
  const open = useInstall.getState().open !== null;
  const offer = shouldOfferInstall({
    method,
    state: readInstallState(),
    now,
    // Unreadable session storage counts as shown: don't risk showing twice.
    shownThisSession: shownThisSession !== false || open,
  });
  if (!offer || method === null) return false;
  show(trigger, method);
  return true;
}

/** The "Install app" menu item: opens the dialog whenever installing works. */
export function openInstallPrompt(): void {
  const method = currentInstallMethod();
  if (method === null) return;
  show("menu", method);
}

function finish(outcome: "installed" | "dismissed", now: Date): void {
  const open = useInstall.getState().open;
  if (open === null) return;
  // A dismissal counts against key moments only: the menu item was asked for.
  if (outcome === "dismissed" && open.from !== "menu") {
    const state = readInstallState();
    if (state) writeInstallState(recordInstallDismissal(state, now));
  }
  useInstall.setState({
    open: null,
    ...(outcome === "installed" ? { installed: true } : {}),
  });
  track("install_prompt_result", {
    trigger: open.from,
    platform: installPlatform(open.method),
    outcome,
  });
}

/** "Not now", "Got it" and Esc. */
export function dismissInstallPrompt(now: Date = new Date()): void {
  finish("dismissed", now);
}

/**
 * The dialog's Install button: replays the browser's own prompt. Declining
 * there is a dismissal.
 */
export async function promptInstall(now: Date = new Date()): Promise<void> {
  const { deferred } = useInstall.getState();
  if (!deferred) {
    finish("dismissed", now);
    return;
  }
  // A prompt event works once; Chromium sends a fresh one if it's still wanted.
  useInstall.setState({ deferred: null });
  try {
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    finish(outcome === "accepted" ? "installed" : "dismissed", now);
  } catch {
    // Used already, or the browser changed its mind.
    finish("dismissed", now);
  }
}
