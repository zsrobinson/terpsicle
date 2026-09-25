import { switchSection } from "~/app/actions";
import { track } from "~/app/analytics";
import type { Course, CourseCode, SectionCode } from "~/core/schema";
import { editablePlan } from "~/features/courses/actions";
import { nowIso } from "~/state/ids";
import { useWorkspace } from "~/state/workspace-store";

// Course details' header actions. Each is one undoable commit with its toast.

/** "Add to Plan A": places the course in a section (the first that fits). */
export function addToPlan(course: Course, sectionCode: SectionCode): boolean {
  return switchSection(course.code, sectionCode, "list");
}

/** "Save for later" on a course not in the plan yet: in Courses, no section. */
export function saveNewCourseForLater(courseCode: CourseCode): boolean {
  const plan = editablePlan();
  if (!plan || plan.courses.some((c) => c.courseCode === courseCode))
    return false;
  useWorkspace.getState().dispatch(
    {
      type: "course/add",
      planId: plan.id,
      courseCode,
      section: null,
      now: nowIso(),
    },
    `Saved ${courseCode} for later`,
  );
  track("course_saved_for_later", { via: "details" });
  return true;
}
