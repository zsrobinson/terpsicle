import { track } from "~/app/analytics";
import type { CourseCode } from "~/core/schema";
import { editablePlan } from "~/features/courses/actions";
import { nowIso } from "~/state/ids";
import { useWorkspace } from "~/state/workspace-store";

// Course details' header actions. Each is one undoable commit with its toast.
// Sections are added from their rows (`switchSection`); the header bookmarks.

/** "Bookmark" on a course not in the plan yet: in Courses, no section. */
export function bookmarkCourse(courseCode: CourseCode): boolean {
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
    `Bookmarked ${courseCode}`,
  );
  track("course_saved_for_later", { via: "details" });
  return true;
}
