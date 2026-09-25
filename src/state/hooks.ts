import { useMemo } from "react";
import {
  buildCatalogIndex,
  type CatalogIndex,
  placedSections,
  type SectionRef,
} from "~/core/catalog";
import { buildFitContext, type FitContext } from "~/core/fit";
import { countBySeverity, planProblems } from "~/core/problems";
import type {
  Block,
  ChangesFile,
  Connection,
  CourseCode,
  CourseColor,
  Plan,
  Problem,
  SeatsFile,
  Term,
  TermId,
  TravelSettings,
} from "~/core/schema";
import { sharedViewPlan } from "~/core/share";
import { type CampusMap, planConnections } from "~/core/travel";
import { creditsLabel, planCredits } from "./catalog-helpers";
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
  ): readonly Problem[] =>
    planProblems({
      plan,
      index,
      blocks,
      travel,
      campus,
      seats: seats?.seats ?? null,
      changes: changes?.changes ?? [],
    }),
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

/**
 * The current plan's problems, most serious first (SPEC §3.6). Empty until
 * the term's catalog has loaded: a missing section would otherwise read as
 * cancelled.
 */
export function usePlanProblems(): readonly Problem[] {
  const current = useCurrentPlan();
  const catalog = useTermCatalog(current?.termId ?? null);
  const { travel, campus } = useTravel();
  if (!current || !catalog?.complete) return NO_PROBLEMS;
  return problemsFor(
    current.plan,
    catalog.index,
    current.blocks,
    travel,
    campus,
    catalog.seats,
    catalog.changes,
  );
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
