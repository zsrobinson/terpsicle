import { useEffect } from "react";
import { create } from "zustand";
import {
  type PushAskDevice,
  type PushAskKind,
  pushAskKind,
  recordHomeScreenAsk,
  recordInstallDismissal,
  recordPushAskDismissal,
} from "~/core/pwa";
import type { PushAskMoment } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import {
  readInstallState,
  writeInstallState,
} from "~/features/pwa/install-prefs";
import {
  markShownThisSession,
  wasShownThisSession,
} from "~/features/pwa/install-session";
import { track } from "~/lib/analytics";
import { noteToast } from "~/ui/toast";
import { readPushAskState, writePushAskState } from "./push-ask-prefs";
import type { TurnOnResult } from "./this-device";

// Asking to turn on notifications at the moment they're worth it (V2 §6.7,
// "Asking"; the rules are `pushAskKind` in ~/core/pwa). A moment calls
// `askForPush` right after it happens: your first post in a Chat room,
// connecting ELMS, a seat watch starting. Where the browser can say yes, the
// moment's own page shows a card in our words (`PushAskCard`, which it
// places); Turn on is the tap the browser's prompt needs. On an iPhone tab
// the ask is the three-step sheet to the Home Screen, and the Home Screen
// app's first launch shows the Turn on step by itself (`PushAskHost`).
// "Not now" is remembered in localStorage, "asked" for this tab in
// sessionStorage (DATA.md §5.2).

/** sessionStorage: set once anything asked in this tab. */
export const PUSH_ASKED_SESSION_KEY = "terpsicle:push-asked";

/** Whether this tab asked already; unreadable storage counts as yes. */
function askedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(PUSH_ASKED_SESSION_KEY) === "1";
  } catch {
    return true;
  }
}

function markAsked(): void {
  try {
    window.sessionStorage.setItem(PUSH_ASKED_SESSION_KEY, "1");
  } catch {
    // Blocked: askedThisSession() says yes from now on anyway.
  }
}

type SheetKind = Exclude<PushAskKind, "card">;

interface PushAskStore {
  /** The moment whose card is showing (or about to, on its page). */
  card: PushAskMoment | null;
  /** The iPhone sheet: the three steps, or the Home Screen app's one. */
  sheet: { moment: PushAskMoment; kind: SheetKind } | null;
  /** Turn on is waiting on the browser's prompt. */
  working: boolean;
  /** Pages mounted where each moment's card can show. */
  hosts: Partial<Record<PushAskMoment, number>>;
}

export const usePushAsk = create<PushAskStore>(() => ({
  card: null,
  sheet: null,
  working: false,
  hosts: {},
}));

/** Test hook: back to nothing asked, nothing shown. */
export function resetPushAskForTests(): void {
  usePushAsk.setState({ card: null, sheet: null, working: false, hosts: {} });
}

// The browser's side loads on first use, with the notifications client:
// the pages that place a card (course details, signed out too) don't carry
// it up front (as read-here.ts).
const thisDevice = () => import("./this-device");
let deviceFacts: () => Promise<PushAskDevice> = async () =>
  (await thisDevice()).pushAskDevice();
let turnOn: (publicKey: string) => Promise<TurnOnResult> = async (key) =>
  (await thisDevice()).turnOnHere(key);

/** Test hook: a fake browser. */
export function setPushAskDeviceForTests(
  facts: typeof deviceFacts,
  on: typeof turnOn,
): void {
  deviceFacts = facts;
  turnOn = on;
}

/** How long a moment waits for its page to mount a place for the card. */
export const HOST_WAIT_MS = 1500;

/**
 * Whether a page has a place for `moment`'s card, waiting briefly for one
 * when asked to: a watch started on the way back from signing in can come
 * before the phone's drawer has mounted course details.
 */
function hostFor(moment: PushAskMoment, wait: boolean): Promise<boolean> {
  if (usePushAsk.getState().hosts[moment]) return Promise.resolve(true);
  if (!wait) return Promise.resolve(false);
  return new Promise((resolve) => {
    const stop = usePushAsk.subscribe((state) => {
      if (!state.hosts[moment]) return;
      clearTimeout(timer);
      stop();
      resolve(true);
    });
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, HOST_WAIT_MS);
  });
}

/**
 * Asks to turn on notifications after `moment`, if its rules allow (at most
 * once a session, not after "Not now", never once they're on here). Signed
 * in only: a device's notifications belong to an account. A card shows only
 * where its moment's page has a place for it (`PushAskCard`). Returns how it
 * asked, or null.
 */
export async function askForPush(
  moment: PushAskMoment,
  now: Date = new Date(),
  {
    waitForPage = false,
  }: {
    /** The page with the card's place may still be mounting: wait a moment for it. */
    waitForPage?: boolean;
  } = {},
): Promise<PushAskKind | null> {
  if (typeof window === "undefined") return null;
  const account = useAccount.getState();
  if (
    account.status !== "signed-in" ||
    !account.flags.push ||
    !account.pushPublicKey
  )
    return null;
  const { card, sheet } = usePushAsk.getState();
  if (card !== null || sheet !== null) return null;
  const device = await deviceFacts();
  // The iPhone sheet is the install prompt too: one of them a session.
  const iphone = device.support === "ios-home-screen";
  const kind = pushAskKind({
    moment,
    device,
    state: readPushAskState(),
    now,
    askedThisSession:
      askedThisSession() || (iphone && wasShownThisSession() !== false),
  });
  if (kind === null) return null;
  if (kind === "card" && !(await hostFor(moment, waitForPage))) return null;
  // Something else asked while the browser answered.
  const current = usePushAsk.getState();
  if (current.card !== null || current.sheet !== null) return null;
  markAsked();
  if (kind === "iphone-setup") markShownThisSession();
  if (kind === "home-screen") {
    const state = readPushAskState();
    if (state) writePushAskState(recordHomeScreenAsk(state, now));
  }
  usePushAsk.setState(
    kind === "card" ? { card: moment } : { sheet: { moment, kind } },
  );
  track("push_ask_shown", { moment, kind });
  return kind;
}

type AskOutcome = "on" | "dismissed" | "blocked" | "failed";

function done(moment: PushAskMoment, kind: PushAskKind, outcome: AskOutcome) {
  track("push_ask_result", { moment, kind, outcome });
}

function remember(now: Date, alsoInstall: boolean): void {
  const state = readPushAskState();
  if (state) writePushAskState(recordPushAskDismissal(state, now));
  if (!alsoInstall) return;
  const install = readInstallState();
  if (install) writeInstallState(recordInstallDismissal(install, now));
}

/**
 * Turn on (the card's, or the Home Screen app's): the browser's prompt,
 * then this device's subscription. Closing the prompt counts as Not now.
 */
export async function turnOnFromAsk(now: Date = new Date()): Promise<void> {
  const { card, sheet, working } = usePushAsk.getState();
  const publicKey = useAccount.getState().pushPublicKey;
  const moment = card ?? sheet?.moment;
  const kind: PushAskKind | null = card ? "card" : (sheet?.kind ?? null);
  if (working || !moment || !kind || !publicKey) return;
  usePushAsk.setState({ working: true });
  const result = await turnOn(publicKey);
  usePushAsk.setState({ working: false, card: null, sheet: null });
  if (result === "on") {
    done(moment, kind, "on");
    noteToast("Notifications are on here", {
      id: "push-ask",
      description: "Change them anytime in Settings.",
    });
    return;
  }
  if (result === "dismissed") remember(now, false);
  done(
    moment,
    kind,
    result === "dismissed"
      ? "dismissed"
      : result === "denied"
        ? "blocked"
        : "failed",
  );
  const words = (await thisDevice()).TURN_ON_WORDS[result];
  if (words) noteToast(words, { id: "push-ask" });
}

/** Not now, Got it, Esc or a drag away: remembered, so it isn't asked again for 90 days. */
export function dismissPushAsk(now: Date = new Date()): void {
  const { card, sheet, working } = usePushAsk.getState();
  if (working) return;
  const moment = card ?? sheet?.moment;
  const kind: PushAskKind | null = card ? "card" : (sheet?.kind ?? null);
  if (!moment || !kind) return;
  usePushAsk.setState({ card: null, sheet: null });
  // The Home Screen app asks once anyway; the iPhone sheet is also the
  // install prompt, so its Got it counts there as the dialog's would.
  if (kind !== "home-screen") remember(now, kind === "iphone-setup");
  done(moment, kind, "dismissed");
}

/**
 * Makes this page a place for `moment`'s card while it's mounted, and says
 * whether the card shows. A card left unanswered goes with its page: it
 * asked once.
 */
export function usePushAskCard(moment: PushAskMoment): boolean {
  useEffect(() => {
    usePushAsk.setState((s) => ({
      hosts: { ...s.hosts, [moment]: (s.hosts[moment] ?? 0) + 1 },
    }));
    return () => {
      usePushAsk.setState((s) => {
        const left = (s.hosts[moment] ?? 1) - 1;
        return {
          hosts: { ...s.hosts, [moment]: left },
          ...(left === 0 && s.card === moment && !s.working
            ? { card: null }
            : {}),
        };
      });
    };
  }, [moment]);
  return usePushAsk((s) => s.card === moment);
}
