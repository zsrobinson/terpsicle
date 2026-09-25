import { openTab, startGenerate } from "~/app/actions";
import { track } from "~/app/analytics";
import type { CourseCode, Plan } from "~/core/schema";
import { readActiveTermId } from "~/state/hooks";
import { nowIso } from "~/state/ids";
import { activePlanId } from "~/state/plan-ops";
import { useShare } from "~/state/share-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";

// What people do with the courses in a plan. Each change is one undoable
// commit whose label becomes the Undo toast (SPEC §3.1), and each records its
// analytics event, so the Courses tab and course details count the same way.

/** The person's open plan in the term on screen; null in a shared view. */
export function editablePlan(): Plan | null {
  if (useShare.getState().shared) return null;
  const termId = readActiveTermId();
  if (!termId) return null;
  const w = useWorkspace.getState();
  const id = activePlanId(w, termId);
  return w.plans.find((p) => p.id === id) ?? null;
}

/** Opens a course's details over the current tab (SPEC §1: one way to open things). */
export function openCourse(courseCode: CourseCode): void {
  useUi.getState().drill({ kind: "course", courseCode });
}

/** Removes a course (placed or saved) from the open plan. Undoable. */
export function removeCourse(
  courseCode: CourseCode,
  via: "menu" | "details",
): boolean {
  const plan = editablePlan();
  if (!plan?.courses.some((c) => c.courseCode === courseCode)) return false;
  useWorkspace
    .getState()
    .dispatch(
      { type: "course/remove", planId: plan.id, courseCode, now: nowIso() },
      `Removed ${courseCode} from ${plan.name}`,
    );
  track("course_removed", { via });
  return true;
}

/** Takes a placed course off the calendar and keeps it under "Saved for later". Undoable. */
export function saveCourseForLater(
  courseCode: CourseCode,
  via: "menu" | "details",
): boolean {
  const plan = editablePlan();
  const entry = plan?.courses.find((c) => c.courseCode === courseCode);
  if (!plan || !entry || entry.sectionCode === null) return false;
  useWorkspace.getState().dispatch(
    {
      type: "course/save-for-later",
      planId: plan.id,
      courseCode,
      now: nowIso(),
    },
    `Saved ${courseCode} for later`,
  );
  track("course_saved_for_later", { via });
  return true;
}

/** The first-visit guide's two paths (SPEC §3.2). */
export function chooseFirstVisitPath(path: "build" | "generate"): void {
  track("first_visit_path_chosen", { path });
  if (path === "build") {
    openTab("search", "click");
    useUi.getState().requestFocus("search");
  } else {
    // Generate's own tab is where plans get generated (SPEC §3.9), ready
    // for the first course.
    startGenerate();
  }
}
