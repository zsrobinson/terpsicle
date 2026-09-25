import { definePanels } from "~/app/registry";
import { GeneratePanel } from "./generate-panel";
import { ResultDetails, resultCrumb } from "./result-details";

export const panels = definePanels({
  tabs: { generate: GeneratePanel },
  drills: {
    "generated-plan": {
      component: ResultDetails,
      crumb: (entry) => resultCrumb(entry.resultId),
    },
  },
});
