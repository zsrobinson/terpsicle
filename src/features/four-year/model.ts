import { createContext, useContext, useMemo } from "react";
import { type TermTags, termTags } from "~/core/catalog/term-tag";
import type { FourYearCourses } from "~/core/four-year/course-lookup";
import {
  type ColumnSummary,
  type CreditTotals,
  columnSummary,
  creditTotals,
} from "~/core/four-year/credits";
import { allocateGenEds, type GenEdAllocation } from "~/core/four-year/gen-ed";
import { handoffTerm } from "~/core/four-year/handoff";
import { detectFourYearProblems } from "~/core/four-year/problems";
import { type StatusOf, statusResolver } from "~/core/four-year/status";
import { defaultTargetTerm, fourYearColumns } from "~/core/four-year/terms";
import type {
  IsoDate,
  LocalId,
  PlanSearch,
  PlanTab,
  Severity,
  TermId,
} from "~/core/schema";
import type {
  FourYearDoc,
  FourYearProblem,
  FourYearTerm,
} from "~/core/schema/four-year";
import { useCourseLookup, useFourYearFacts } from "./data";

// Everything the page shows about the open doc, worked out once per change
// by core: columns and their status, credits, GenEd progress and problems.
// Components read this and render (CLAUDE.md: "read state, call core").

export type PlanModel = {
  readonly doc: FourYearDoc;
  readonly today: IsoDate;
  readonly lookup: FourYearCourses;
  readonly columns: readonly FourYearTerm[];
  readonly statusOf: StatusOf;
  readonly summaries: ReadonlyMap<FourYearTerm, ColumnSummary>;
  readonly totals: CreditTotals;
  readonly genEds: GenEdAllocation;
  readonly problems: readonly FourYearProblem[];
  /** Problems by the entries they're about, for the blocks' quiet inset. */
  readonly problemsByEntry: ReadonlyMap<LocalId, readonly FourYearProblem[]>;
  /** Where Add puts a course: the picked semester, else the one in progress or next. */
  readonly target: FourYearTerm;
  /** The next semester, which hands its courses to the scheduler (V3 §2.12). */
  readonly handoffTerm: TermId | null;
  /** Now and Next (V2 §5.5), from the same calendars as the status. */
  readonly tags: TermTags;
};

export function usePlanModel(
  doc: FourYearDoc,
  today: IsoDate,
  picked: FourYearTerm | undefined,
): PlanModel {
  const lookup = useCourseLookup(doc);
  const calendars = useFourYearFacts((s) => s.calendars);
  const latestTermId = useFourYearFacts((s) => s.latestTermId);
  return useMemo(() => {
    const statusOf = statusResolver(today, calendars);
    const columns = fourYearColumns(doc);
    const problems = detectFourYearProblems({
      doc,
      lookup,
      statusOf,
      latestTermId,
    });
    const problemsByEntry = new Map<LocalId, FourYearProblem[]>();
    for (const p of problems)
      for (const s of p.subjects)
        if (s.kind === "entry")
          problemsByEntry.set(s.entryId, [
            ...(problemsByEntry.get(s.entryId) ?? []),
            p,
          ]);
    return {
      doc,
      today,
      lookup,
      columns,
      statusOf,
      summaries: new Map(
        columns.map((t) => [t, columnSummary(doc, t, lookup)] as const),
      ),
      totals: creditTotals(doc, lookup, statusOf),
      genEds: allocateGenEds(doc, lookup, statusOf),
      problems,
      problemsByEntry,
      handoffTerm: handoffTerm(columns, statusOf),
      tags: termTags(today, calendars),
      target:
        picked !== undefined && columns.includes(picked)
          ? picked
          : defaultTargetTerm(columns, statusOf),
    };
  }, [doc, today, lookup, calendars, latestTermId, picked]);
}

export type PlanNavOptions = {
  /** For typing and other transient changes; otherwise Back undoes it. */
  readonly replace?: boolean;
  /** Opens something the in-app Back closes (a course in the sidebar). */
  readonly drill?: boolean;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** A Plan view's route says which view it is (src/routes/plan.*.tsx). */
    planView?: PlanTab;
  }
}

/** Where Plan is: the view on its rail (its route), and the search params. */
export type PlanPlace = PlanSearch & { readonly tab: PlanTab };

/** The page's URL state, and how to change it. */
export type PlanNav = {
  readonly search: PlanPlace;
  /**
   * Moves within Plan. A `tab` in the patch goes to that view's route
   * (`tab: undefined` is GenEd); without one, the view stays.
   */
  readonly go: (
    patch: Partial<PlanSearch> & { readonly tab?: PlanTab | undefined },
    options?: PlanNavOptions,
  ) => void;
  /**
   * The in-app Back: the browser's Back when what it closes was opened in
   * the app, so the two are one thing (decisions.md, "Back and Forward undo
   * navigation"); else, after a link straight to it, `patch` in place.
   */
  readonly back: (patch: Partial<PlanSearch>) => void;
};

/** Closes what's open over the view: a course, or a transfer credit. */
export const CLOSE_DRILL = { course: undefined, credit: undefined } as const;

/** Whether a course or a transfer credit is open over the view. */
export function isDrilled(search: PlanSearch): boolean {
  return search.course !== undefined || search.credit !== undefined;
}

const NavContext = createContext<PlanNav | null>(null);
export const PlanNavProvider = NavContext.Provider;

export function usePlanNav(): PlanNav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("usePlanNav outside PlanNavProvider");
  return nav;
}

const ModelContext = createContext<PlanModel | null>(null);
export const PlanModelProvider = ModelContext.Provider;

export function useModel(): PlanModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error("useModel outside PlanModelProvider");
  return model;
}

/**
 * A four-year plan someone shared (/plan/shared): the same semesters and
 * blocks, with nothing to press that would change it.
 */
const ReadOnlyContext = createContext(false);
export const PlanReadOnlyProvider = ReadOnlyContext.Provider;

export function usePlanReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** Problems by severity, for the scheduler's words ("1 problem · 2 notes"). */
export function useProblemCounts(): Record<Severity, number> {
  const { problems } = useModel();
  return useMemo(() => {
    const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const p of problems) counts[p.severity]++;
    return counts;
  }, [problems]);
}
