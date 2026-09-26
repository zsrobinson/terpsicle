import { lazyModule, lazyPanel } from "~/app/lazy-panel";
import { definePanels } from "~/app/registry";

// Loaded on first use, with the .ics builder.
const panel = lazyModule(() => import("./export-panel"));

export const panels = definePanels({
  tabs: { export: lazyPanel(panel, (m) => m.ExportPanel) },
});
