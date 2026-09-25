import { definePanels } from "~/app/registry";
import { ConnectionDetails } from "./connection-details";
import { TravelPanel } from "./travel-panel";

export const panels = definePanels({
  tabs: { travel: TravelPanel },
  drills: {
    connection: {
      component: ConnectionDetails,
      crumb: () => "Connection",
    },
  },
});
