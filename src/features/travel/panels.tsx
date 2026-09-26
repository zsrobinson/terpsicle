import { lazyModule, lazyPanel } from "~/app/lazy-panel";
import { definePanels } from "~/app/registry";

// Loaded on first use; the calendar's pills and problems open connection
// details too, so both views come in one chunk.
const views = lazyModule(() =>
  Promise.all([import("./travel-panel"), import("./connection-details")]).then(
    ([panel, details]) => ({ ...panel, ...details }),
  ),
);

export const panels = definePanels({
  tabs: { travel: lazyPanel(views, (m) => m.TravelPanel) },
  drills: {
    connection: {
      component: lazyPanel(views, (m) => m.ConnectionDetails),
      name: () => "Connection",
    },
  },
});
