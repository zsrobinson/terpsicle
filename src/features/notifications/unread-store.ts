import { useEffect } from "react";
import { create } from "zustand";
import { onReadInWorker, syncBadge } from "./badge";

// The bell's number (docs/V2.md §6.7): unread items in Notifications, the
// same number as the app badge. It comes from `notifications/unread` when
// the page gets focus and every 2 minutes while it's showing, and from
// every read: a row opened, "Mark all read", a course or Todo's day
// (./read-here.ts), and a notification clicked (the service worker says so).

export const useUnread = create<{ unread: number | null }>(() => ({
  unread: null,
}));

/** A fresh count, from any answer that has one: the bell and the app badge follow. */
export function gotUnread(unread: number): void {
  useUnread.setState({ unread });
  syncBadge(unread);
}

/** How often the count is asked for while the page shows. */
export const POLL_MS = 2 * 60_000;
/** A focus soon after the last ask doesn't ask again (focus and visibility fire together). */
export const REFOCUS_MS = 15_000;

/**
 * Keeps the count fresh while `on` (signed in): once now, on focus, and
 * every `POLL_MS` while the page is visible, never more. Calls load the
 * client on first use, so signed-out pages don't carry it.
 */
export function useUnreadPolling(on: boolean): void {
  useEffect(() => {
    if (!on) {
      useUnread.setState({ unread: null });
      return;
    }
    let asked = Number.NEGATIVE_INFINITY;
    let live = true;
    const ask = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - asked < REFOCUS_MS) return;
      asked = now;
      import("~/server/fns/notifications")
        .then(({ notificationsApi }) => notificationsApi.unread())
        .then(({ unread }) => {
          if (live) gotUnread(unread);
        })
        .catch(() => {
          // Offline, or signed out meanwhile: the next focus asks again.
          asked = Number.NEGATIVE_INFINITY;
        });
    };
    ask();
    const timer = window.setInterval(ask, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ask();
    };
    window.addEventListener("focus", ask);
    document.addEventListener("visibilitychange", onVisible);
    const stopWorker = onReadInWorker((unread) => {
      if (live) gotUnread(unread);
    });
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", ask);
      document.removeEventListener("visibilitychange", onVisible);
      stopWorker();
    };
  }, [on]);
}
