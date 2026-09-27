import { track } from "~/app/analytics";
import {
  addedLine,
  handoffToast,
  linkedSchedulePlan,
  planHandoff,
} from "~/core/four-year/handoff";
import type { CourseCode, LocalId, TermId } from "~/core/schema";
import {
  type FourYearColumn,
  fourYearLinkDb,
  NO_FOUR_YEAR_COLUMN,
  readFourYearColumn,
} from "~/state/four-year-link";
import { nowIso } from "~/state/ids";
import { reduceWorkspace } from "~/state/plan-ops";
import { useWorkspace } from "~/state/workspace-store";

// Arriving from Plan's "View schedule" (docs/V3.md §2.12), and the Courses
// tab's "Add them". Each change is one undoable commit with its toast.

/** Bookmarks courses in a plan: one step for Undo. */
function bookmark(
  planId: LocalId,
  courses: readonly CourseCode[],
  label: string,
): void {
  const now = nowIso();
  useWorkspace.getState().commit(label, (w) =>
    courses.reduce(
      (acc, courseCode) =>
        reduceWorkspace(acc, {
          type: "course/add",
          planId,
          courseCode,
          section: null,
          now,
        }),
      w,
    ),
  );
}

/**
 * Makes or opens the term's linked plan for the four-year plan's column.
 * A term with no plan gets "Plan A" with the column's courses bookmarked
 * (Undo takes them back out, leaving the empty Plan A any first visit
 * shows); a term with plans opens the linked one, unchanged.
 */
export function applyHandoff(termId: TermId, column: FourYearColumn): void {
  const step = planHandoff(
    termId,
    useWorkspace.getState().plans,
    useWorkspace.getState().activePlanByTerm,
    column.courses,
  );
  if (step.kind === "none") return;
  if (step.kind === "open") {
    useWorkspace.getState().activatePlan(termId, step.plan.id);
    track("four_year_handoff", { outcome: "opened-plan" });
    return;
  }
  // A term always has a plan (the shell's rule), so the new one starts as
  // the empty plan a first visit makes, and Undo returns to that.
  if (step.kind === "create") useWorkspace.getState().ensurePlan(termId);
  const w = useWorkspace.getState();
  const plan = linkedSchedulePlan(termId, w.plans, w.activePlanByTerm);
  if (!plan) return;
  bookmark(
    plan.id,
    column.courses,
    handoffToast(plan.name, column.courses.length),
  );
  track("four_year_handoff", { outcome: "created-plan" });
}

/** Reads the four-year plan's column for the term, then hands it over. */
export async function arriveFromPlan(
  termId: TermId,
  db = fourYearLinkDb(),
): Promise<void> {
  const column = await readFourYearColumn(db, termId).catch(
    (error: unknown) => {
      console.warn("Couldn't read the four-year plan", error);
      return NO_FOUR_YEAR_COLUMN;
    },
  );
  applyHandoff(termId, column);
}

/** "Add them": bookmarks the column's courses the plan doesn't have. */
export function addFromFourYear(
  planId: LocalId,
  missing: readonly CourseCode[],
): void {
  if (missing.length === 0) return;
  bookmark(planId, missing, addedLine(missing));
}
