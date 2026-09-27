// What "Include what I was doing" sends (docs/FEEDBACK.md): the page's last
// ~50 app actions, kept in memory here and never sent anywhere until someone
// sends feedback with the box checked. Fed by `track()` (even with PostHog
// off), route changes (the pattern only), uncaught errors and failed API
// calls (route and status, never a body). Nothing here holds other people's
// words: events carry analytics' short values, and routes are scrubbed.
//
// Loads with every page, so it imports no schemas (zod doesn't tree-shake).
import { scrubUrl } from "~/core/analytics/scrub";
import { ACTIVITY_LOG_SIZE, boundedProps, cut } from "~/core/feedback/props";
import type { ActivityEntry } from "~/core/schema/feedback";

let entries: ActivityEntry[] = [];

export function logActivity(entry: ActivityEntry): void {
  entries.push(entry);
  if (entries.length > ACTIVITY_LOG_SIZE)
    entries = entries.slice(-ACTIVITY_LOG_SIZE);
}

/** The log, oldest first. */
export function recentActivity(): readonly ActivityEntry[] {
  return entries;
}

/** Test hook. */
export function clearActivity(): void {
  entries = [];
}

const EVENT_NAME = /^[a-z0-9_]{1,64}$/;

/** An app event, as `track()` sends it. */
export function logEvent(name: string, props: object): void {
  if (!EVENT_NAME.test(name)) return;
  logActivity({
    type: "event",
    at: Date.now(),
    name,
    props: boundedProps(props as Record<string, unknown>, 20),
  });
}

let lastRoute = "";

/** A route change: its pattern and allowlisted search params only. */
export function logNavigation(href: string): void {
  const route = cut(scrubUrl(href) || "/", 300);
  if (route === lastRoute) return;
  lastRoute = route;
  logActivity({ type: "nav", at: Date.now(), route });
}

/** An error the page raised: its name, message and stack, cut short. */
export function logError(error: unknown): void {
  const e =
    error instanceof Error
      ? error
      : { name: "Error", message: String(error), stack: undefined };
  logActivity({
    type: "error",
    at: Date.now(),
    name: cut(e.name || "Error", 100),
    message: cut(e.message || "", 500),
    stack: e.stack ? cut(e.stack, 2_000) : null,
  });
}

/** A failed API call: its route and status (0 without a network). */
export function logFailedRequest(route: string, status: number): void {
  logActivity({
    type: "request",
    at: Date.now(),
    method: "POST",
    route: cut(scrubUrl(route) || route, 200),
    status: Math.min(599, Math.max(0, status)),
  });
}
