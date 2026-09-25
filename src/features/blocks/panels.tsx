import { definePanels } from "~/app/registry";
import { BlocksPanel } from "./blocks-panel";

export const panels = definePanels({ tabs: { blocks: BlocksPanel } });
