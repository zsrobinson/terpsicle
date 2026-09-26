import { lazyModule, lazyPanel } from "~/app/lazy-panel";
import { definePanels } from "~/app/registry";

// The form, its results and the generator's worker client load on first use.
// The drill-in only opens from the results, so its module is loaded by then
// and its crumb can read it.
const views = lazyModule(() =>
  Promise.all([import("./generate-panel"), import("./result-details")]).then(
    ([panel, details]) => ({ ...panel, ...details }),
  ),
);

export const panels = definePanels({
  tabs: { generate: lazyPanel(views, (m) => m.GeneratePanel) },
  drills: {
    "generated-plan": {
      component: lazyPanel(views, (m) => m.ResultDetails),
      crumb: (entry) => views.current?.resultCrumb(entry.resultId) ?? "Plan",
    },
  },
});
