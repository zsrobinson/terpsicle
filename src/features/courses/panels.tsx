import { definePanels } from "~/app/registry";
import { CoursesPanel } from "./courses-panel";

// `?term=&course=` (the seat-alert emails' link) is a URL like any other:
// src/app/schedule-url.ts follows it.
export const panels = definePanels({
  tabs: { courses: CoursesPanel },
});
