import { createPlanFrom } from "~/app/actions";
import { track } from "~/app/analytics";
import { resultCourses } from "~/core/generate";
import type {
  GeneratedPlan,
  GenerateRequest,
  LocalId,
  PlanCourse,
} from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { newLocalId, nowIso } from "~/state/ids";
import { reduceWorkspace } from "~/state/plan-ops";
import { useWorkspace } from "~/state/workspace-store";

// "Save as new plan" and "Save 3 plans" (SPEC §3.9): generating creates
// plans, never edits one. Several at once are one undo step, and the best
// of them opens.

/** A result as plan courses, from the term's loaded catalog. */
export function coursesOf(
  result: GeneratedPlan,
  request: GenerateRequest,
): PlanCourse[] {
  const index = useCatalog.getState().byTerm[request.termId]?.index;
  return index ? resultCourses(result, request, index) : [];
}

/** Saves results as new plans, in the order given; returns the new ids. */
export function saveResults(
  results: readonly GeneratedPlan[],
  request: GenerateRequest,
): LocalId[] {
  const { termId } = request;
  const lists = results
    .map((r) => coursesOf(r, request))
    .filter((c) => c.length > 0);
  const [only, ...more] = lists;
  if (!only) return [];
  if (more.length === 0) {
    const id = createPlanFrom(termId, only, { source: "generate" });
    track("generate_plans_saved", { count: 1 });
    return [id];
  }
  const plans = lists.map((courses) => ({ id: newLocalId(), courses }));
  const now = nowIso();
  useWorkspace.getState().commit(`Saved ${plans.length} plans`, (w) => {
    const created = plans.reduce(
      (next, { id, courses }) =>
        reduceWorkspace(next, {
          type: "plan/create",
          id,
          termId,
          courses,
          now,
        }),
      w,
    );
    // The best result opens, like saving one does.
    return reduceWorkspace(created, {
      type: "plan/activate",
      termId,
      planId: plans[0]?.id ?? "",
    });
  });
  const ids = plans.map((p) => p.id);
  for (const _ of ids) track("plan_created", { source: "generate" });
  track("generate_plans_saved", { count: ids.length });
  return ids;
}
