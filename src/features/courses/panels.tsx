import { definePanels } from "~/app/registry";
import { CoursesPanel } from "./courses-panel";
import { DeepLinkEffect } from "./deep-link";

export const panels = definePanels({
  tabs: { courses: CoursesPanel },
  effects: [DeepLinkEffect],
});
