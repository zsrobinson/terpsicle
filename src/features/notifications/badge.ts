import { SW_NOTIFICATIONS_READ_MESSAGE } from "~/core/schema";

// The app icon's number (docs/V2.md §6.7): the inbox's unread count,
// nothing else. The service worker sets it from each push's `badge` and
// after a notification click; pages set it after anything they read
// (`syncBadge`), and hear the service worker's reads (`onReadInWorker`).

type Badging = Partial<{
  setAppBadge(count: number): Promise<void>;
  clearAppBadge(): Promise<void>;
}>;

/** Sets the app badge to `unread`, or clears it at 0. Quiet where there's no Badging API. */
export function syncBadge(unread: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & Badging;
  try {
    const done = unread > 0 ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.();
    // Refused (not installed, no permission): the number is a nicety.
    done?.catch(() => {});
  } catch {
    // Same.
  }
}

/**
 * Calls `listener` with the unread count after a notification click read
 * something in the service worker, so a page's bell matches the badge.
 * Returns the unsubscribe.
 */
export function onReadInWorker(listener: (unread: number) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return () => {};
  const heard = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; unread?: unknown } | null;
    if (
      data?.type === SW_NOTIFICATIONS_READ_MESSAGE &&
      typeof data.unread === "number"
    )
      listener(data.unread);
  };
  navigator.serviceWorker.addEventListener("message", heard);
  return () => navigator.serviceWorker.removeEventListener("message", heard);
}
