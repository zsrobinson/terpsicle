import { definePanels } from "~/app/registry";
import { ProblemsPanel } from "./problems-panel";

export const panels = definePanels({ tabs: { problems: ProblemsPanel } });
