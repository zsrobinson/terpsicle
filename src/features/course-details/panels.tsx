import { definePanels } from "~/app/registry";
import { CourseDetails } from "./course-details";

export const panels = definePanels({
  drills: {
    course: {
      component: CourseDetails,
      name: (entry) => entry.courseCode,
      monoName: true,
    },
  },
});
