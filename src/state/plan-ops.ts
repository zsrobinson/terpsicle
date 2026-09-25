// TODO(core): replace with ~/core/plans once M1 core lands. This is the
// minimal set of pure plan operations the shell needs (create, rename,
// duplicate, delete, pick the active plan). The workspace store calls them
// through `reduceWorkspace`, the one seam to swap for core's reducer.
import type {
  Block,
  CourseCode,
  CourseColor,
  LocalId,
  Plan,
  PlanCourse,
  TermId,
} from "~/core/schema";
import { PlanNameSchema } from "~/core/schema";

/** Everything undo covers: plans, blocks, colors and which plan is open. */
export interface Workspace {
  plans: readonly Plan[];
  blocks: readonly Block[];
  courseColors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  activePlanByTerm: Readonly<Partial<Record<TermId, LocalId>>>;
}

export const EMPTY_WORKSPACE: Workspace = {
  plans: [],
  blocks: [],
  courseColors: {},
  activePlanByTerm: {},
};

export type WorkspaceAction =
  | {
      type: "plan/create";
      id: LocalId;
      termId: TermId;
      /** Omitted: the next free "Plan A", "Plan B", … */
      name?: string;
      courses?: readonly PlanCourse[];
      now: string;
    }
  | { type: "plan/rename"; id: LocalId; name: string; now: string }
  | { type: "plan/duplicate"; id: LocalId; newId: LocalId; now: string }
  | {
      type: "plan/delete";
      id: LocalId;
      /** Used when the term would be left without a plan. */
      replacementId: LocalId;
      now: string;
    }
  | { type: "plan/activate"; termId: TermId; id: LocalId };

export function plansInTerm(
  plans: readonly Plan[],
  termId: TermId,
): readonly Plan[] {
  return plans
    .filter((p) => p.termId === termId)
    .sort((a, b) => a.order - b.order);
}

/** The open plan for a term: the remembered one, else the first tab. */
export function activePlanId(
  w: Workspace,
  termId: TermId,
): LocalId | undefined {
  const inTerm = plansInTerm(w.plans, termId);
  const remembered = w.activePlanByTerm[termId];
  if (remembered && inTerm.some((p) => p.id === remembered)) return remembered;
  return inTerm[0]?.id;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** "Plan A", "Plan B", … then "Plan 27", "Plan 28", … */
export function nextPlanName(inTerm: readonly Pick<Plan, "name">[]): string {
  const taken = new Set(inTerm.map((p) => p.name));
  for (const letter of LETTERS) {
    if (!taken.has(`Plan ${letter}`)) return `Plan ${letter}`;
  }
  for (let n = LETTERS.length + 1; ; n++) {
    if (!taken.has(`Plan ${n}`)) return `Plan ${n}`;
  }
}

/** A name not used in the term: `base`, else `base 2`, `base 3`, … (max 60 chars). */
export function uniquePlanName(
  base: string,
  inTerm: readonly Pick<Plan, "name">[],
): string {
  const taken = new Set(inTerm.map((p) => p.name));
  const clip = (s: string, suffix = "") =>
    `${s.slice(0, 60 - suffix.length).trimEnd()}${suffix}`;
  if (!taken.has(clip(base))) return clip(base);
  for (let n = 2; ; n++) {
    const name = clip(base, ` ${n}`);
    if (!taken.has(name)) return name;
  }
}

function setActive(w: Workspace, termId: TermId, id: LocalId): Workspace {
  return { ...w, activePlanByTerm: { ...w.activePlanByTerm, [termId]: id } };
}

function withPlan(w: Workspace, plan: Plan): Workspace {
  return setActive({ ...w, plans: [...w.plans, plan] }, plan.termId, plan.id);
}

function newPlan(
  w: Workspace,
  fields: Pick<Plan, "id" | "termId" | "order" | "createdAt"> & {
    name?: string | undefined;
    courses?: readonly PlanCourse[] | undefined;
  },
): Plan {
  const inTerm = plansInTerm(w.plans, fields.termId);
  return {
    id: fields.id,
    termId: fields.termId,
    name: fields.name
      ? uniquePlanName(fields.name, inTerm)
      : nextPlanName(inTerm),
    order: fields.order,
    createdAt: fields.createdAt,
    updatedAt: fields.createdAt,
    courses: [...(fields.courses ?? [])],
  };
}

function lastOrder(inTerm: readonly Plan[]): number {
  return inTerm.reduce((max, p) => Math.max(max, p.order), -1);
}

/** Applies one action. Unknown ids leave the workspace unchanged. */
export function reduceWorkspace(
  w: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
    case "plan/create": {
      const inTerm = plansInTerm(w.plans, action.termId);
      return withPlan(
        w,
        newPlan(w, {
          id: action.id,
          termId: action.termId,
          name: action.name,
          courses: action.courses,
          order: lastOrder(inTerm) + 1,
          createdAt: action.now,
        }),
      );
    }
    case "plan/rename": {
      const parsed = PlanNameSchema.safeParse(action.name);
      const plan = w.plans.find((p) => p.id === action.id);
      if (!parsed.success || !plan || plan.name === parsed.data) return w;
      const others = plansInTerm(w.plans, plan.termId).filter(
        (p) => p.id !== plan.id,
      );
      const name = uniquePlanName(parsed.data, others);
      return {
        ...w,
        plans: w.plans.map((p) =>
          p.id === action.id ? { ...p, name, updatedAt: action.now } : p,
        ),
      };
    }
    case "plan/duplicate": {
      const source = w.plans.find((p) => p.id === action.id);
      if (!source) return w;
      const inTerm = plansInTerm(w.plans, source.termId);
      // Right after the source tab: halfway to the next one.
      const next = inTerm.find((p) => p.order > source.order);
      const order = next ? (source.order + next.order) / 2 : source.order + 1;
      return withPlan(
        w,
        newPlan(w, {
          id: action.newId,
          termId: source.termId,
          name: `${source.name} copy`,
          courses: source.courses,
          order,
          createdAt: action.now,
        }),
      );
    }
    case "plan/delete": {
      const plan = w.plans.find((p) => p.id === action.id);
      if (!plan) return w;
      const inTerm = plansInTerm(w.plans, plan.termId);
      const index = inTerm.findIndex((p) => p.id === plan.id);
      const rest = inTerm.filter((p) => p.id !== plan.id);
      let next: Workspace = {
        ...w,
        plans: w.plans.filter((p) => p.id !== plan.id),
      };
      if (rest.length === 0) {
        // A term always has a plan to show; undo brings the deleted one back.
        return withPlan(
          next,
          newPlan(next, {
            id: action.replacementId,
            termId: plan.termId,
            order: 0,
            createdAt: action.now,
          }),
        );
      }
      if (activePlanId(w, plan.termId) === plan.id) {
        const neighbor = rest[Math.max(0, index - 1)];
        if (neighbor) next = setActive(next, plan.termId, neighbor.id);
      }
      return next;
    }
    case "plan/activate": {
      const plan = w.plans.find((p) => p.id === action.id);
      if (!plan || plan.termId !== action.termId) return w;
      return setActive(w, action.termId, action.id);
    }
  }
}
