import { definePanels } from "~/app/registry";
import { GeneratePanel } from "./generate-panel";
import { ResultDetails, resultName } from "./result-details";

export const panels = definePanels({
  tabs: { generate: GeneratePanel },
  drills: {
    "generated-plan": {
      component: ResultDetails,
      name: (entry) => resultName(entry.resultId),
    },
  },
});
