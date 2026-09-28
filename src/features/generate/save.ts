import { resultCourses } from "~/core/generate/result-plan";
import { nextPlanName } from "~/core/plans/naming";
import type {
  GeneratedPlan,
  GenerateRequest,
  LocalId,
  PlanCourse,
  TermId,
} from "~/core/schema";
import { createPlanFrom } from "~/features/schedule/actions";
import { track } from "~/lib/analytics";
import { useCatalog } from "~/state/catalog-store";
import { useWorkspace } from "~/state/workspace-store";

// "Add as Plan C" (SPEC §3.9): generating creates plans, never edits one.
// The new plan opens, with Undo in the toast.

/** A result as plan courses, from the term's loaded catalog. */
export function coursesOf(
  result: GeneratedPlan,
  request: GenerateRequest,
): PlanCourse[] {
  const index = useCatalog.getState().byTerm[request.termId]?.index;
  return index ? resultCourses(result, request, index) : [];
}

/** The name a new plan in the term gets: "Plan C". */
export function nextPlanNameIn(termId: TermId): string {
  return nextPlanName(
    useWorkspace
      .getState()
      .plans.filter((p) => p.termId === termId)
      .map((p) => p.name),
  );
}

/** Adds a result as a new plan and opens it; returns its id, or null when the catalog's gone. */
export function addResultAsPlan(
  result: GeneratedPlan,
  request: GenerateRequest,
): LocalId | null {
  const courses = coursesOf(result, request);
  if (courses.length === 0) return null;
  const id = createPlanFrom(request.termId, courses, {
    source: "generate",
    name: nextPlanNameIn(request.termId),
  });
  track("generate_plans_saved", { count: 1 });
  return id;
}
