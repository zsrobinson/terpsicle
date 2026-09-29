// The app telling the head's load recovery (./load-recovery.ts) that React
// has taken over the page, so a note about a missing file can't land in a
// page that's still starting. Its own module, so the page's code doesn't
// carry the recovery script's text.

/** The event the app sends once React has taken over the page. */
export const BOOTED_EVENT = "terpsicle:booted";

/** Tells load recovery the app has started (the root layout's first effect). */
export function markBooted(): void {
  window.dispatchEvent(new Event(BOOTED_EVENT));
}
