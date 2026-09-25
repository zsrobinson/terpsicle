import { useMemo } from "react";
import {
  type Block,
  type CourseCode,
  type CourseColor,
  type Plan,
  type PlanCourse,
  type Problem,
  parseSectionKey,
  type SharePayload,
  type Term,
  type TermId,
} from "~/core/schema";
import { creditsLabel, planCredits, snapshotOf } from "./catalog-helpers";
import { type TermCatalog, useCatalog } from "./catalog-store";
import { activePlanId, plansInTerm } from "./plan-ops";
import { useShare } from "./share-store";
import { pickTerm } from "./terms";
import { useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// The hooks features read the shell's state through. Components stay thin:
// read these, call core, render (CLAUDE.md).

export interface ActiveTerm {
  /** The term on screen: the shared plan's while one is open, else the person's. */
  term: Term | undefined;
  termId: TermId | null;
  /** Every published term, newest first; null while loading. */
  terms: readonly Term[] | null;
}

export function useActiveTerm(): ActiveTerm {
  const terms = useCatalog((s) => s.terms);
  const lastTermId = useUi((s) => s.lastTermId);
  const sharedTermId = useShare((s) =>
    s.shared?.status === "ready" ? s.shared.payload.termId : null,
  );
  return useMemo(() => {
    if (!terms) return { term: undefined, termId: sharedTermId, terms };
    const term = sharedTermId
      ? terms.find((t) => t.id === sharedTermId)
      : pickTerm(terms, lastTermId);
    return { term, termId: term?.id ?? sharedTermId, terms };
  }, [terms, lastTermId, sharedTermId]);
}

/** The person's plans in a term, in tab order. */
export function useTermPlans(termId: TermId | null): readonly Plan[] {
  const plans = useWorkspace((s) => s.plans);
  return useMemo(
    () => (termId ? plansInTerm(plans, termId) : []),
    [plans, termId],
  );
}

/** The id of the person's open plan in a term. */
export function useActivePlanId(termId: TermId | null): string | undefined {
  return useWorkspace((s) => (termId ? activePlanId(s, termId) : undefined));
}

/**
 * The plan on screen. Features render this, never a plan picked by hand, so
 * the shared-link view works everywhere for free. When `readOnly`, offer no
 * edits: the plan isn't the person's.
 */
export type CurrentPlan =
  | {
      source: "own";
      readOnly: false;
      termId: TermId;
      plan: Plan;
      /** The term's blocks (blocks are per term, not per plan). */
      blocks: readonly Block[];
      colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
    }
  | {
      source: "shared";
      readOnly: true;
      termId: TermId;
      plan: Plan;
      /** The sharer's blocks, shown only in this view. */
      blocks: readonly Block[];
      /** The sharer's colors, falling back to the person's own. */
      colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
    };

export function useCurrentPlan(): CurrentPlan | null {
  const { termId } = useActiveTerm();
  const shared = useShare((s) => s.shared);
  const plans = useWorkspace((s) => s.plans);
  const blocks = useWorkspace((s) => s.blocks);
  const colors = useWorkspace((s) => s.courseColors);
  const activeId = useActivePlanId(termId);
  const catalog = useCatalog((s) => (termId ? s.byTerm[termId] : undefined));

  return useMemo((): CurrentPlan | null => {
    if (!termId) return null;
    if (shared?.status === "ready") {
      const { payload } = shared;
      return {
        source: "shared",
        readOnly: true,
        termId,
        plan: sharedPlanView(payload, catalog),
        blocks: (payload.blocks ?? []).map((b, i) => ({
          ...b,
          id: `shared-block-${i}`,
          termId,
        })),
        colors: { ...colors, ...payload.colors },
      };
    }
    if (shared) return null;
    const plan = plans.find((p) => p.id === activeId);
    if (!plan) return null;
    return {
      source: "own",
      readOnly: false,
      termId,
      plan,
      blocks: blocks.filter((b) => b.termId === termId),
      colors,
    };
  }, [termId, shared, plans, blocks, colors, activeId, catalog]);
}

/**
 * The shared payload as a plan. Sections the catalog doesn't have (yet, or
 * any more) get an empty snapshot, so core's catalog diff reports them as
 * cancelled, as DATA.md §8 asks.
 */
export function sharedPlanView(
  payload: SharePayload,
  catalog: TermCatalog | undefined,
): Plan {
  const courses: PlanCourse[] = payload.sections.flatMap((key) => {
    const parsed = parseSectionKey(key);
    if (!parsed) return [];
    const section = catalog?.courses[parsed.courseCode]?.sections.find(
      (s) => s.code === parsed.sectionCode,
    );
    return [
      {
        ...parsed,
        snapshot: section
          ? snapshotOf(section)
          : { instructors: [], delivery: "f2f", meetings: [] },
      },
    ];
  });
  for (const courseCode of payload.saved ?? [])
    courses.push({ courseCode, sectionCode: null, snapshot: null });
  const epoch = new Date(0).toISOString();
  return {
    id: "shared-plan",
    termId: payload.termId,
    name: payload.name ?? "Shared plan",
    order: 0,
    createdAt: epoch,
    updatedAt: epoch,
    courses,
  };
}

/** "16 credits" for the plan on screen, or null before it exists. */
export function useCreditsLabel(): string | null {
  const current = useCurrentPlan();
  const courses = useCatalog((s) =>
    current ? s.byTerm[current.termId]?.courses : undefined,
  );
  return useMemo(
    () =>
      current ? creditsLabel(planCredits(current.plan, courses ?? {})) : null,
    [current, courses],
  );
}

// TODO(core): compute with ~/core/problems once M1 core lands.
const NO_PROBLEMS: readonly Problem[] = [];

/** The current plan's problems, most serious first (SPEC §3.6). */
export function usePlanProblems(): readonly Problem[] {
  return NO_PROBLEMS;
}

export interface ProblemCounts {
  error: number;
  warning: number;
  info: number;
}

export function useProblemCounts(): ProblemCounts {
  const problems = usePlanProblems();
  return useMemo(() => {
    const counts: ProblemCounts = { error: 0, warning: 0, info: 0 };
    for (const p of problems) counts[p.severity] += 1;
    return counts;
  }, [problems]);
}
