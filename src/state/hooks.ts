import { useMemo } from "react";
import {
  buildCatalogIndex,
  type CatalogIndex,
  pendingPlanDepts,
  pickTerm,
  placedSections,
  type SectionRef,
} from "~/core/catalog";
import { buildFitContext, type FitContext } from "~/core/fit";
import { creditsLabel, planCredits } from "~/core/plans";
import { countBySeverity, planProblems } from "~/core/problems";
import type {
  Block,
  ChangesFile,
  Connection,
  CourseCode,
  CourseColor,
  DeptCode,
  Manifest,
  Plan,
  Problem,
  SeatsFile,
  Term,
  TermId,
  TravelSettings,
} from "~/core/schema";
import { sharedViewPlan } from "~/core/share";
import { type CampusMap, planConnections } from "~/core/travel";
import { type TermCatalog, useCatalog } from "./catalog-store";
import { activePlanId, plansInTerm } from "./plan-ops";
import { useShare } from "./share-store";
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

/** The term on screen, outside React (actions). Same rule as `useActiveTerm`. */
export function readActiveTermId(): TermId | null {
  const { terms } = useCatalog.getState();
  const shared = useShare.getState().shared;
  if (shared) return shared.payload.termId;
  if (!terms) return null;
  return pickTerm(terms, useUi.getState().lastTermId)?.id ?? null;
}

export function useActiveTerm(): ActiveTerm {
  const terms = useCatalog((s) => s.terms);
  const lastTermId = useUi((s) => s.lastTermId);
  const sharedTermId = useShare((s) => s.shared?.payload.termId ?? null);
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
export type CurrentPlan = {
  source: "own" | "shared";
  readOnly: boolean;
  termId: TermId;
  plan: Plan;
  /**
   * The term's blocks (blocks are per term, not per plan); in the shared
   * view, the sharer's blocks, shown only there.
   */
  blocks: readonly Block[];
  /** Colors by course; in the shared view, the sharer's first. */
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
};

const EPOCH = new Date(0).toISOString();

export function useCurrentPlan(): CurrentPlan | null {
  const { termId } = useActiveTerm();
  const shared = useShare((s) => s.shared);
  const plans = useWorkspace((s) => s.plans);
  const blocks = useWorkspace((s) => s.blocks);
  const colors = useWorkspace((s) => s.colors);
  const activeId = useActivePlanId(termId);
  const index = useCatalog((s) =>
    termId ? s.byTerm[termId]?.index : undefined,
  );

  return useMemo((): CurrentPlan | null => {
    if (!termId) return null;
    if (shared) {
      const { payload } = shared;
      return {
        source: "shared",
        readOnly: true,
        termId,
        // Sections the catalog doesn't have (yet, or any more) get an empty
        // snapshot, so Problems reports them as cancelled (DATA §8).
        plan: sharedViewPlan(
          payload,
          index ?? buildCatalogIndex(termId, []),
          "shared-plan",
          EPOCH,
        ),
        blocks: (payload.blocks ?? []).map((b, i) => ({
          ...b,
          id: `shared-block-${i}`,
          termId,
        })),
        colors: { ...colors, ...payload.colors },
      };
    }
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
  }, [termId, shared, plans, blocks, colors, activeId, index]);
}

/** The loaded catalog of a term: its index, seats, changes, and whether it's complete. */
export function useTermCatalog(termId: TermId | null): TermCatalog | undefined {
  return useCatalog((s) => (termId ? s.byTerm[termId] : undefined));
}

/**
 * One cached result per input set, shared by every component: core asks for
 * contexts built once per plan state, not once per render (core/README.md).
 */
function lastResult<A extends readonly unknown[], R>(
  compute: (...args: A) => R,
): (...args: A) => R {
  let lastArgs: A | null = null;
  let last: R;
  return (...args: A) => {
    if (
      lastArgs?.length === args.length &&
      lastArgs.every((a, i) => a === args[i])
    )
      return last;
    last = compute(...args);
    lastArgs = args;
    return last;
  };
}

const placedFor = lastResult(
  (plan: Plan, index: CatalogIndex): readonly SectionRef[] =>
    placedSections(plan, index),
);
const fitFor = lastResult(
  (
    plan: Plan,
    index: CatalogIndex,
    blocks: readonly Block[],
    travel: TravelSettings,
    campus: CampusMap,
  ): FitContext => buildFitContext({ plan, index, blocks, travel, campus }),
);
const connectionsFor = lastResult(
  (
    sections: readonly SectionRef[],
    travel: TravelSettings,
    campus: CampusMap,
  ): readonly Connection[] => planConnections(sections, travel, campus),
);
const problemsFor = lastResult(
  (
    plan: Plan,
    index: CatalogIndex,
    blocks: readonly Block[],
    travel: TravelSettings,
    campus: CampusMap,
    seats: SeatsFile | null,
    changes: ChangesFile | null,
    pendingDepts: ReadonlySet<DeptCode>,
  ): readonly Problem[] =>
    planProblems({
      plan,
      index,
      blocks,
      travel,
      campus,
      seats: seats?.seats ?? null,
      changes: changes?.changes ?? [],
      pendingDepts,
    }),
);
const listedDepts = lastResult(
  (manifest: Manifest): ReadonlySet<DeptCode> =>
    new Set(manifest.departments.map((d) => d.code)),
);
/** One Set per distinct list, so the problems cache holds across renders. */
const deptSet = lastResult(
  (joined: string): ReadonlySet<DeptCode> =>
    new Set(joined ? joined.split(",") : []),
);

/** The current plan's placed sections as they are in the catalog, in plan order. */
export function usePlacedSections(): readonly SectionRef[] {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  if (!current || !catalog) return NO_SECTIONS;
  return placedFor(current.plan, catalog.index);
}
const NO_SECTIONS: readonly SectionRef[] = [];

/** Travel settings and the campus map, for anything computing travel. */
export function useTravel(): { travel: TravelSettings; campus: CampusMap } {
  const travel = useWorkspace((s) => s.travel);
  const campus = useCatalog((s) => s.campus);
  return useMemo(() => ({ travel, campus }), [travel, campus]);
}

/**
 * Core's fit context for the plan on screen (fit labels, "Fits my plan",
 * ghosts), built once per plan state and shared. Null until the plan's
 * departments have loaded.
 */
export function useFitContext(): FitContext | null {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const { travel, campus } = useTravel();
  if (!current || !catalog) return null;
  return fitFor(current.plan, catalog.index, current.blocks, travel, campus);
}

/** Connections between the plan's back-to-back classes (travel pills, Travel tab). */
export function usePlanConnections(): readonly Connection[] {
  const sections = usePlacedSections();
  const { travel, campus } = useTravel();
  return connectionsFor(sections, travel, campus);
}

/** "16 credits" for the plan on screen, or null before it exists. */
export function useCreditsLabel(): string | null {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  return useMemo(
    () =>
      current && catalog
        ? creditsLabel(planCredits(current.plan, catalog.index))
        : current
          ? creditsLabel({ min: 0, max: 0 })
          : null,
    [current, catalog],
  );
}

const NO_PROBLEMS: readonly Problem[] = [];

export interface PlanProblemsState {
  /** Most serious first (SPEC §3.6). */
  problems: readonly Problem[];
  /**
   * The plan's own departments are still loading, so `problems` is empty
   * for now: show a neutral state, never "No problems".
   */
  checking: boolean;
}

const NOTHING_TO_CHECK: PlanProblemsState = {
  problems: NO_PROBLEMS,
  checking: false,
};
const CHECKING: PlanProblemsState = { problems: NO_PROBLEMS, checking: true };

/**
 * The current plan's problems, as soon as the plan's own departments have
 * loaded (the shell loads them first), not the whole term. A section missing
 * from a loaded department is cancelled; one in a department that failed to
 * load is left out rather than called cancelled.
 */
export function usePlanProblemsState(): PlanProblemsState {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const { travel, campus } = useTravel();
  // Memoized on the result's inputs, so consumers get a stable object.
  const inputs = (() => {
    if (!current) return null;
    if (current.plan.courses.length === 0) return deptSet("");
    if (!catalog?.manifest) return "checking" as const;
    const depts = catalog.depts;
    const pending = pendingPlanDepts(
      current.plan,
      listedDepts(catalog.manifest),
      (dept) => depts[dept] === "ready",
    );
    if ([...pending].some((dept) => depts[dept] !== "error"))
      return "checking" as const;
    return deptSet([...pending].sort().join(","));
  })();
  const problems =
    inputs && typeof inputs !== "string" && current && catalog
      ? problemsFor(
          current.plan,
          catalog.index,
          current.blocks,
          travel,
          campus,
          catalog.seats,
          catalog.changes,
          inputs,
        )
      : NO_PROBLEMS;
  return useMemo(
    () =>
      inputs === "checking"
        ? CHECKING
        : problems === NO_PROBLEMS
          ? NOTHING_TO_CHECK
          : { problems, checking: false },
    [inputs, problems],
  );
}

/** The current plan's problems; empty while its departments load (`usePlanProblemsState`). */
export function usePlanProblems(): readonly Problem[] {
  return usePlanProblemsState().problems;
}

export interface ProblemCounts {
  error: number;
  warning: number;
  info: number;
}

export function useProblemCounts(): ProblemCounts {
  const problems = usePlanProblems();
  return useMemo(() => countBySeverity(problems), [problems]);
}
