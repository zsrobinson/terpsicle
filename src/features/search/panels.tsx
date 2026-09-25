import { definePanels } from "~/app/registry";
import { SearchPanel } from "./search-panel";

export const panels = definePanels({ tabs: { search: SearchPanel } });
