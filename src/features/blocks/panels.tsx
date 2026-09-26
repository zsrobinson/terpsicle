import { lazyModule, lazyPanel } from "~/app/lazy-panel";
import { definePanels } from "~/app/registry";

const panel = lazyModule(() => import("./blocks-panel"));

export const panels = definePanels({
  tabs: { blocks: lazyPanel(panel, (m) => m.BlocksPanel) },
});
