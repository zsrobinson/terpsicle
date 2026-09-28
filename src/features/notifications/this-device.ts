import { fromBase64url } from "~/core/push/bytes";
import {
  deviceLabel,
  isIos,
  isIosSafari,
  type PushAskDevice,
} from "~/core/pwa";
import { isStandalone } from "~/features/pwa/install-state";
import { notificationsApi } from "~/server/fns/notifications";

// Web push on this browser (V2.md §3.3): whether it can, the permission, and
// turning it on (subscribe with our VAPID key, then save the subscription)
// or off. Asking for permission happens only here, on a person's own tap.

/**
 * What this browser can do: `ok`; `ios-home-screen` (iPhone and iPad allow
 * web push only in a Home Screen app); `unsupported` (no Push API, or no
 * service worker here: dev, previews).
 */
export type PushSupport = "ok" | "ios-home-screen" | "unsupported";

export function pushSupport(win: Window = window): PushSupport {
  const nav = win.navigator;
  if (isIos(nav.userAgent, nav.maxTouchPoints) && !isStandalone(win))
    return "ios-home-screen";
  if (
    !("serviceWorker" in nav) ||
    !("PushManager" in win) ||
    !("Notification" in win)
  )
    return "unsupported";
  return "ok";
}

/** The browser's permission for notifications ("default" means not asked yet). */
export function notificationPermission(): NotificationPermission {
  return typeof Notification === "undefined"
    ? "denied"
    : Notification.permission;
}

/** The registered service worker, without waiting for one that may never come. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

/** This browser's push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    return (
      (await (await registration())?.pushManager.getSubscription()) ?? null
    );
  } catch {
    return null;
  }
}

/** The endpoint to name this device by (the device list, sign-out). */
export async function currentEndpoint(): Promise<string | undefined> {
  return (await currentSubscription())?.endpoint;
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const bytes = new Uint8Array(a);
  return bytes.every((byte, i) => byte === b[i]);
}

export type TurnOnResult =
  | "on"
  | "denied"
  | "dismissed"
  | "no-service-worker"
  | "unsupported"
  | "off-here"
  | "failed";

/**
 * Asks for permission (the tap is the person's), subscribes with
 * `publicKey` and saves it to their account. A subscription made with
 * another key (the pair was rotated) is replaced.
 */
export async function turnOnHere(publicKey: string): Promise<TurnOnResult> {
  const key = fromBase64url(publicKey);
  if (!key || pushSupport() !== "ok") return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "dismissed";
    const reg = await registration();
    if (!reg) return "no-service-worker";
    let subscription = await reg.pushManager.getSubscription();
    if (
      subscription &&
      !sameKey(subscription.options.applicationServerKey, key)
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return "failed";
    const saved = await notificationsApi.subscribe({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      label: deviceLabel(navigator.userAgent, navigator.maxTouchPoints),
    });
    if (saved.status === "ok") return "on";
    // Nothing on our side will use it: don't leave it behind.
    await subscription.unsubscribe();
    return saved.status === "off" ? "off-here" : "unsupported";
  } catch {
    return "failed";
  }
}

/**
 * Why turning on didn't work, in plain words (SPEC §3.13); null when the
 * person closed the browser's prompt, which needs no words.
 */
export const TURN_ON_WORDS: Record<
  Exclude<TurnOnResult, "on">,
  string | null
> = {
  denied:
    "Your browser blocked notifications for Terpsicle. Allow them in its site settings, then try again.",
  dismissed: null,
  "no-service-worker":
    "Notifications only work on terpsicle.com. If you're there, try again in a moment.",
  unsupported: "This browser can't get notifications from Terpsicle.",
  "off-here": "Notifications are turned off on Terpsicle for now.",
  failed:
    "Couldn't turn on notifications. Check your connection and try again.",
};

/** What the ask moments need to know about this browser (`pushAskKind`). */
export async function pushAskDevice(
  win: Window = window,
): Promise<PushAskDevice> {
  const { userAgent, maxTouchPoints = 0 } = win.navigator;
  const support = pushSupport(win);
  return {
    support,
    permission: notificationPermission(),
    subscribed: support === "ok" && (await currentSubscription()) !== null,
    iosSafari: isIosSafari(userAgent, maxTouchPoints),
    iosHomeScreen: isIos(userAgent, maxTouchPoints) && isStandalone(win),
  };
}

/** Stops push here: forgets it on the account, then in the browser. */
export async function turnOffHere(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await notificationsApi.unsubscribe({ endpoint: subscription.endpoint });
  await subscription.unsubscribe().catch(() => false);
}
