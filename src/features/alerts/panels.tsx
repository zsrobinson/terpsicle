import { definePanels } from "~/app/registry";
import { useSeatWatchesSync } from "./seat-watches";

/** Loads the signed-in person's seat watches; forgets them on sign-out. */
function SeatWatchesSync() {
  useSeatWatchesSync();
  return null;
}

export const panels = definePanels({ effects: [SeatWatchesSync] });
