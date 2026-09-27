import type { PlanTab } from "~/core/schema/plan-url";

// Plan's routes (src/routes/plan.*.tsx): one per view on its rail, GenEd at
// `/plan` itself, with the search params of ~/core/schema/plan-url on all
// of them. Each view's route names its view in `staticData.planView`, which
// is how the page knows which one is open.

/** Each view's route. Samples is `templates` in code (CONTEXT.md, "Template"). */
export const PLAN_VIEW_PATHS = {
  gened: "/plan",
  problems: "/plan/problems",
  search: "/plan/search",
  templates: "/plan/samples",
  import: "/plan/import",
} as const satisfies Record<PlanTab, string>;
