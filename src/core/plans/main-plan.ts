import type { LocalId, MainPlans, Plan, TermId } from "../schema";

// Main plans (docs/V2.md §5.5): try as many plans as you like in a term, and
// one of them, the main plan, is the one you're actually taking. Chat, Plan,
// Todo and the calendar feed read it; the rest are drafts, which only
// Schedule shows. It's saved with the plans (the settings doc's
// `mainPlans`), so every device agrees. A term without a choice, or whose
// choice is gone, has its first tab as main, so it never points at nothing.

/** What tab order and the main plan read of a plan: pages that parse plans raw pass no more. */
export type TabbedPlan = Pick<Plan, "id" | "termId" | "order" | "createdAt">;

/** Tab order, the way the scheduler shows a term's plans; ties by age, then id. */
export function byTab(a: TabbedPlan, b: TabbedPlan): number {
  return (
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** A term's plans in tab order. */
export function tabsInTerm<P extends TabbedPlan>(
  plans: readonly P[],
  termId: TermId,
): P[] {
  return plans.filter((p) => p.termId === termId).sort(byTab);
}

/**
 * The term's main plan: the one `mainPlans` names while it's still one of
 * the term's plans, otherwise the first tab. Null with no plan in the term.
 */
export function mainPlanFor<P extends TabbedPlan>(
  termId: TermId,
  plans: readonly P[],
  mainPlans: Readonly<MainPlans>,
): P | null {
  const tabs = tabsInTerm(plans, termId);
  const chosen = mainPlans[termId];
  return tabs.find((p) => p.id === chosen) ?? tabs[0] ?? null;
}

/** Whether `plan` is its term's main plan. */
export function isMainPlan(
  plan: Pick<Plan, "id" | "termId">,
  plans: readonly Plan[],
  mainPlans: Readonly<MainPlans>,
): boolean {
  return mainPlanFor(plan.termId, plans, mainPlans)?.id === plan.id;
}

/**
 * Whether the term shows which plan is main: only with two or more plans.
 * With one, there's no choice to make, so there's no marker and no word.
 */
export function hasDrafts(plans: readonly Plan[], termId: TermId): boolean {
  let count = 0;
  for (const p of plans) if (p.termId === termId && ++count > 1) return true;
  return false;
}

/** `mainPlans` with `plan` as its term's main plan (the same object when it already is). */
export function withMainPlan(
  mainPlans: Readonly<MainPlans>,
  plan: Pick<Plan, "id" | "termId">,
): Readonly<MainPlans> {
  if (mainPlans[plan.termId] === plan.id) return mainPlans;
  return { ...mainPlans, [plan.termId]: plan.id };
}

/**
 * `mainPlans` for after `planId` is deleted (`plans` is before). Deleting
 * the main plan passes main to the next tab, or the one before when it was
 * the last; with no plan left, the term's choice goes. Deleting a draft
 * changes nothing (the same object).
 */
export function mainPlansAfterDelete(
  mainPlans: Readonly<MainPlans>,
  plans: readonly Plan[],
  planId: LocalId,
): Readonly<MainPlans> {
  const plan = plans.find((p) => p.id === planId);
  if (!plan || !isMainPlan(plan, plans, mainPlans)) return mainPlans;
  const tabs = tabsInTerm(plans, plan.termId);
  const at = tabs.indexOf(plan);
  const heir = tabs[at + 1] ?? tabs[at - 1];
  if (heir) return withMainPlan(mainPlans, heir);
  const { [plan.termId]: _gone, ...rest } = mainPlans;
  return rest;
}

/**
 * `mainPlans` for before the term's tabs move: a term that was going by its
 * first tab names that plan, so a new first tab doesn't quietly take over.
 */
export function mainPlansBeforeMove(
  mainPlans: Readonly<MainPlans>,
  plans: readonly Plan[],
  termId: TermId,
): Readonly<MainPlans> {
  const main = mainPlanFor(termId, plans, mainPlans);
  return main ? withMainPlan(mainPlans, main) : mainPlans;
}
