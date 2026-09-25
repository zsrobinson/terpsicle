import { definePanels } from "~/app/registry";
import { ExportPanel } from "./export-panel";

export const panels = definePanels({ tabs: { export: ExportPanel } });
