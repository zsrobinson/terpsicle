import { useEffect, useRef } from "react";
import { definePanels } from "~/app/registry";
import { useSeatAlerts } from "~/state/seat-alerts";
import { ALERTS_INBOX_KEY } from "./inbox";
import { importAlertsInbox, refreshSeatAlerts, syncSeatAlerts } from "./sync";

/** Status checks on return to the tab, at most this often (the endpoint is rate-limited). */
const REFRESH_EVERY_MS = 2 * 60_000;

/**
 * Once the local list has loaded: take in the confirm page's hand-off and
 * refresh statuses. The confirm link usually opens a new tab, so an app tab
 * that's already open picks the watch up as soon as that page writes it, and
 * checks again when the person comes back to it.
 */
function SeatAlertsSync() {
  const loaded = useSeatAlerts((s) => s.loaded);
  const started = useRef(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    lastRefresh.current = Date.now();
    syncSeatAlerts(new Date()).catch(logError);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === ALERTS_INBOX_KEY && event.newValue)
        importAlertsInbox().catch(logError);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      importAlertsInbox().catch(logError);
      if (Date.now() - lastRefresh.current < REFRESH_EVERY_MS) return;
      lastRefresh.current = Date.now();
      refreshSeatAlerts(new Date()).catch(logError);
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loaded]);
  return null;
}

const logError = (error: unknown) => console.error(error);

export const panels = definePanels({ effects: [SeatAlertsSync] });
