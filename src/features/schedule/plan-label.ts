import type { CurrentPlan } from "~/state/hooks";

/**
 * The name a panel shows for the plan on screen. A shared link's plan says
 * "Shared plan": the sharer's own name for it ("Plan A") would read as one of
 * your plans, and we don't know who shared it (SPEC §3.11).
 */
export function planLabel(
  current: Pick<CurrentPlan, "source" | "plan">,
): string {
  return current.source === "shared" ? "Shared plan" : current.plan.name;
}
