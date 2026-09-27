import type {
  LegacyPlanSearch,
  PlanSearch,
  PlanTab,
} from "~/core/schema/plan-url";

// Plan's routes (src/routes/plan.*.tsx): one per view on its rail, GenEd at
// `/plan` itself, with the search params of ~/core/schema/plan-url on all
// of them. Old `/plan?tab=` links redirect to their view (plan.index.tsx).

/** Each view's route. Samples is `templates` in code (CONTEXT.md, "Template"). */
export const PLAN_VIEW_PATHS = {
  gened: "/plan",
  problems: "/plan/problems",
  search: "/plan/search",
  templates: "/plan/samples",
  import: "/plan/import",
} as const satisfies Record<PlanTab, string>;
export type PlanViewPath = (typeof PLAN_VIEW_PATHS)[PlanTab];

const VIEW_BY_PATH = new Map<string, PlanTab>(
  Object.entries(PLAN_VIEW_PATHS).map(([view, path]) => [
    path,
    view as PlanTab,
  ]),
);

/** The view a pathname under `/plan` shows; GenEd for anything else. */
export function planViewAt(pathname: string): PlanTab {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return VIEW_BY_PATH.get(path) ?? "gened";
}

/** Where an old `/plan?tab=…` link goes, or null when it has no tab. */
export function legacyPlanLocation(
  search: LegacyPlanSearch,
): { to: PlanViewPath; search: PlanSearch } | null {
  const { tab, ...rest } = search;
  if (tab === undefined) return null;
  return {
    to: PLAN_VIEW_PATHS[tab],
    search: Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    ) as PlanSearch,
  };
}
