// The workspace reducer: core's plans reducer (`~/core/plans`) plus what the
// shell adds on top of it: which plan is open in each term, and a term never
// left without a plan.
import {
  plansInTerm as corePlansInTerm,
  type PlanAction,
  type PlansState,
  plansReducer,
} from "~/core/plans";
import type { LocalId, Plan, TermId } from "~/core/schema";

/** Everything undo covers: plans, blocks, colors and which plan is open. */
export interface Workspace extends PlansState {
  activePlanByTerm: Readonly<Partial<Record<TermId, LocalId>>>;
}

export const EMPTY_WORKSPACE: Workspace = {
  plans: [],
  blocks: [],
  colors: {},
  activePlanByTerm: {},
};

export type WorkspaceAction =
  | Exclude<PlanAction, { type: "plan/delete" }>
  | {
      type: "plan/delete";
      planId: LocalId;
      /** Used when the term would be left without a plan. */
      replacementId: LocalId;
      now: string;
    }
  | { type: "plan/activate"; termId: TermId; planId: LocalId };

export function plansInTerm(
  plans: readonly Plan[],
  termId: TermId,
): readonly Plan[] {
  return corePlansInTerm({ plans, blocks: [], colors: {} }, termId);
}

/** The open plan for a term: the remembered one, else the first tab. */
export function activePlanId(
  w: Pick<Workspace, "plans" | "activePlanByTerm">,
  termId: TermId,
): LocalId | undefined {
  const inTerm = plansInTerm(w.plans, termId);
  const remembered = w.activePlanByTerm[termId];
  if (remembered && inTerm.some((p) => p.id === remembered)) return remembered;
  return inTerm[0]?.id;
}

function setActive(w: Workspace, termId: TermId, id: LocalId): Workspace {
  if (w.activePlanByTerm[termId] === id) return w;
  return { ...w, activePlanByTerm: { ...w.activePlanByTerm, [termId]: id } };
}

function core(w: Workspace, action: PlanAction): Workspace {
  const next = plansReducer(w, action);
  return next === w ? w : { ...next, activePlanByTerm: w.activePlanByTerm };
}

/** Applies one action. An action that changes nothing returns `w` itself. */
export function reduceWorkspace(
  w: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
    case "plan/activate": {
      const plan = w.plans.find((p) => p.id === action.planId);
      if (!plan || plan.termId !== action.termId) return w;
      return setActive(w, action.termId, action.planId);
    }
    case "plan/create": {
      const next = core(w, action);
      return next === w ? w : setActive(next, action.termId, action.id);
    }
    case "plan/duplicate": {
      const next = core(w, action);
      const copy = next.plans.find((p) => p.id === action.id);
      return next === w || !copy ? w : setActive(next, copy.termId, copy.id);
    }
    case "plan/delete": {
      const plan = w.plans.find((p) => p.id === action.planId);
      if (!plan) return w;
      const inTerm = plansInTerm(w.plans, plan.termId);
      const index = inTerm.findIndex((p) => p.id === plan.id);
      const rest = inTerm.filter((p) => p.id !== plan.id);
      const next = core(w, { type: "plan/delete", planId: plan.id });
      if (rest.length === 0) {
        // A term always has a plan to show; undo brings the deleted one back.
        return reduceWorkspace(next, {
          type: "plan/create",
          id: action.replacementId,
          termId: plan.termId,
          now: action.now,
        });
      }
      if (activePlanId(w, plan.termId) !== plan.id) return next;
      const neighbor = rest[Math.max(0, index - 1)];
      return neighbor ? setActive(next, plan.termId, neighbor.id) : next;
    }
    default:
      return core(w, action);
  }
}
