import { track } from "~/app/analytics";
import {
  installPlatform,
  recordInstallDismissal,
  recordPushAskDismissal,
  shouldOfferInstall,
} from "~/core/pwa";
import type { InstallTrigger } from "~/core/schema";
import {
  readPushAskState,
  writePushAskState,
} from "~/features/notifications/push-ask-prefs";
import { readInstallState, writeInstallState } from "./install-prefs";
import { wasShownThisSession } from "./install-session";
import {
  adoptStashedInstallPrompt,
  type BeforeInstallPromptEvent,
  currentInstallMethod,
  show,
  useInstall,
} from "./install-state";

// The install prompt's public trigger, `requestInstallPrompt` (V2 §3.4), and
// the dialog's actions. Chromium hands us its install prompt as a
// `beforeinstallprompt` event, which we keep (so it shows no bar of its own)
// and replay from our dialog's Install button. iOS has no such event; the
// dialog shows the Share → Add to Home Screen steps instead. The state
// itself: install-state.ts.

export {
  type BeforeInstallPromptEvent,
  currentInstallMethod,
  type InstallOpenedFrom,
  isStandalone,
  openInstallPrompt,
  useInstall,
  useInstallMethod,
} from "./install-state";

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
  adoptStashedInstallPrompt(win);
  win.addEventListener("beforeinstallprompt", onPrompt);
  win.addEventListener("appinstalled", onInstalled);
  return () => {
    win.removeEventListener("beforeinstallprompt", onPrompt);
    win.removeEventListener("appinstalled", onInstalled);
  };
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
  adoptStashedInstallPrompt();
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

/**
 * `requestInstallPrompt`, for a moment that comes as the page loads (the
 * first sign-in lands on a fresh page): Chromium offers its prompt a moment
 * after load, so if it hasn't yet, this waits up to `waitMs` for it. Asks
 * once either way.
 */
export function requestInstallPromptSoon(
  trigger: InstallTrigger,
  waitMs = 10_000,
): void {
  if (typeof window === "undefined") return;
  if (requestInstallPrompt(trigger)) return;
  adoptStashedInstallPrompt();
  // Nothing more to wait for: Safari has no prompt event, or one is here.
  if (useInstall.getState().deferred !== null) return;
  const stop = useInstall.subscribe((state) => {
    if (state.deferred === null) return;
    clearTimeout(timer);
    stop();
    requestInstallPrompt(trigger);
  });
  const timer = setTimeout(stop, waitMs);
}

function finish(outcome: "installed" | "dismissed", now: Date): void {
  const open = useInstall.getState().open;
  if (open === null) return;
  // A dismissal counts against key moments only: the menu item was asked for.
  if (outcome === "dismissed" && open.from !== "menu") {
    const state = readInstallState();
    if (state) writeInstallState(recordInstallDismissal(state, now));
    // On iPhone the steps are also the ask for notifications (the same
    // three taps): its Got it counts there too, so they don't come twice.
    if (open.method === "ios-steps") {
      const asked = readPushAskState();
      if (asked) writePushAskState(recordPushAskDismissal(asked, now));
    }
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
