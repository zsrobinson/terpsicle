import { useEffect, useRef } from "react";
import { definePanels } from "~/app/registry";
import { useSeatAlerts } from "~/state/seat-alerts";
import { syncSeatAlerts } from "./sync";

/** Once the local list has loaded: take in the confirm page's hand-off and refresh statuses. */
function SeatAlertsSync() {
  const loaded = useSeatAlerts((s) => s.loaded);
  const started = useRef(false);
  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    syncSeatAlerts(new Date()).catch((error: unknown) => console.error(error));
  }, [loaded]);
  return null;
}

export const panels = definePanels({ effects: [SeatAlertsSync] });
