import { create } from "zustand";
import { track } from "~/app/analytics";
import { type InstallMethod, installMethod, installPlatform } from "~/core/pwa";
import type { InstallTrigger } from "~/core/schema";
import { takeStashedInstallPrompt } from "./install-capture";
import { markShownThisSession } from "./install-session";

// The install prompt's state (V2 §3.4): the browser's kept prompt, and
// whether and how the dialog is open. The "Install app" entry needs only
// this, and it loads with the scheduler, so the key moments' rules and the
// dialog's actions live in install-store.ts, which loads after the page does
// (src/app/pwa.tsx).

/** Chromium's install prompt event (not in TypeScript's DOM types). */
/** What "Install app" does, in its tooltips. */
export const INSTALL_HINT = "Put Terpsicle on your home screen";

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

/**
 * Takes the prompt the head script kept (install-capture.ts), if the app
 * has none yet. The prompt's host loads after the page (src/app/pwa.tsx),
 * and a key moment or the menu item can come first.
 */
export function adoptStashedInstallPrompt(win: Window = window): void {
  const stashed = takeStashedInstallPrompt(win);
  if (stashed && useInstall.getState().deferred === null)
    useInstall.setState({ deferred: stashed as BeforeInstallPromptEvent });
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

/** Opens the dialog and counts it as shown this session. */
export function show(from: InstallOpenedFrom, method: InstallMethod): void {
  markShownThisSession();
  useInstall.setState({ open: { from, method } });
  track("install_prompt_shown", {
    trigger: from,
    platform: installPlatform(method),
  });
}

/** The "Install app" menu item: opens the dialog whenever installing works. */
export function openInstallPrompt(): void {
  adoptStashedInstallPrompt();
  const method = currentInstallMethod();
  if (method === null) return;
  show("menu", method);
}
