import type { PushAskMoment, PushAskState } from "../schema";
import {
  INSTALL_COOLDOWN_DAYS,
  MAX_INSTALL_DISMISSALS,
} from "./install-policy";

// When a moment may ask to turn on notifications here (V2 §6.7, "Asking"),
// the same way the install prompt is asked (install-policy.ts): in our words
// first, then the browser's prompt on the person's own tap; never on load;
// at most once a session; not within 90 days of "Not now"; and never after
// two. Once notifications are on here, or the browser blocks them, no
// moment asks again. The one moment that isn't something the person did is
// the Home Screen app's first launch on iPhone, which the three-step sheet
// promised ("We'll ask once, right there"), so it asks once per device.

/** Days after "Not now" before a moment may ask again (the install prompt's). */
export const PUSH_ASK_COOLDOWN_DAYS = INSTALL_COOLDOWN_DAYS;
/** "Not now"s after which only Settings turns notifications on. */
export const MAX_PUSH_ASK_DISMISSALS = MAX_INSTALL_DISMISSALS;
const DAY_MS = 86_400_000;

export const DEFAULT_PUSH_ASK_STATE: PushAskState = {
  dismissals: 0,
  lastDismissedAt: null,
  homeScreenAskedAt: null,
};

/** What this browser can do about notifications right now. */
export interface PushAskDevice {
  /**
   * `ok`; `ios-home-screen` (iPhone and iPad send web push only to a Home
   * Screen app); `unsupported`. As `pushSupport` in features/notifications.
   */
  support: "ok" | "ios-home-screen" | "unsupported";
  /** `Notification.permission`. */
  permission: "default" | "granted" | "denied";
  /** This browser has a push subscription already. */
  subscribed: boolean;
  /** Safari on iPhone or iPad, which can add Terpsicle to the Home Screen. */
  iosSafari: boolean;
  /** Running as the Home Screen app on iPhone or iPad. */
  iosHomeScreen: boolean;
}

/**
 * How a moment asks: `card`, our words inline with Turn on and Not now;
 * `iphone-setup`, the three-step sheet (Share, Add to Home Screen, open it
 * there); `home-screen`, the Home Screen app's "Turn on notifications" step
 * by itself.
 */
export type PushAskKind = "card" | "iphone-setup" | "home-screen";

/** Whether `state` still lets a moment ask: no recent "Not now", fewer than two. */
function answered(state: PushAskState, now: Date): boolean {
  if (state.dismissals >= MAX_PUSH_ASK_DISMISSALS) return true;
  if (state.lastDismissedAt === null) return false;
  const last = Date.parse(state.lastDismissedAt);
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < PUSH_ASK_COOLDOWN_DAYS * DAY_MS;
}

/**
 * How `moment` asks now, or null when it doesn't. `state` is null when
 * storage can't be read: then nothing asks, since "Not now" couldn't be
 * remembered.
 */
export function pushAskKind({
  moment,
  device,
  state,
  now,
  askedThisSession,
}: {
  moment: PushAskMoment;
  device: PushAskDevice;
  state: PushAskState | null;
  now: Date;
  askedThisSession: boolean;
}): PushAskKind | null {
  if (state === null || askedThisSession) return null;
  if (moment === "home-screen") {
    // Once per device, whatever "Not now" said elsewhere: this is the ask
    // the person installed the app for.
    if (!device.iosHomeScreen || state.homeScreenAskedAt !== null) return null;
    return device.support === "ok" && device.permission === "default"
      ? "home-screen"
      : null;
  }
  if (answered(state, now)) return null;
  if (device.support === "ios-home-screen")
    return device.iosSafari ? "iphone-setup" : null;
  if (device.support !== "ok" || device.permission === "denied") return null;
  // On already: nothing to ask. Allowed but not subscribed (turned off
  // here, or another account's): Turn on subscribes without a prompt.
  if (device.permission === "granted" && device.subscribed) return null;
  return "card";
}

/** The state after "Not now" (or Got it, Esc, or closing the browser's prompt). */
export function recordPushAskDismissal(
  state: PushAskState,
  now: Date,
): PushAskState {
  return {
    ...state,
    dismissals: state.dismissals + 1,
    lastDismissedAt: now.toISOString(),
  };
}

/** The state once the Home Screen app has asked (it asks once). */
export function recordHomeScreenAsk(
  state: PushAskState,
  now: Date,
): PushAskState {
  return { ...state, homeScreenAskedAt: now.toISOString() };
}

/** Each moment's words: why it's worth turning on, right now (the design's "Ask at the moment"). */
export const PUSH_ASK_WORDS: Record<
  Exclude<PushAskMoment, "home-screen">,
  { title: string; line: string }
> = {
  "chat-post": {
    title: "Hear back when someone answers?",
    line: "Get a notification when a classmate mentions you or replies to you. Change it anytime in Settings.",
  },
  "todo-connected": {
    title: "Remind you the evening before something's due?",
    line: "Get one notification the evening before, with everything due the next day. Change it anytime in Settings.",
  },
  "seat-watch": {
    title: "Hear the moment a seat opens?",
    line: "Seats go fast. Get a notification on this device as soon as one opens. Change it anytime in Settings.",
  },
};
