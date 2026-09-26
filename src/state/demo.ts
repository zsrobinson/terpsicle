import { restoreNavigation, useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// `?demo=1` in `pnpm dev:mock` loads the fixtures' demo plans (a returning
// student's plans, blocks and colors) for e2e and screenshots. Real first
// visits stay empty (SPEC §3.2). Production builds (mode "production") drop
// this code and the fixtures import entirely.

export const DEMO_PARAM = "demo";

/** Whether this page asked for the demo, and the build allows it. */
export function demoRequested(search: string): boolean {
  if (import.meta.env.MODE !== "mock") return false;
  return new URLSearchParams(search).has(DEMO_PARAM);
}

/** Replaces the workspace with the demo state. Call after hydrating. */
export async function loadDemoState(): Promise<void> {
  if (import.meta.env.MODE !== "mock") return;
  const { demoBlocks, demoCourseColors, demoPlan, demoPlans } = await import(
    "~/fixtures"
  );
  useWorkspace.setState({
    plans: [...demoPlans],
    blocks: [...demoBlocks],
    colors: Object.fromEntries(
      demoCourseColors.map((c) => [c.courseCode, c.color]),
    ),
    activePlanByTerm: { [demoPlan.termId]: demoPlan.id },
    past: [],
    future: [],
  });
  useUi.setState({ lastTermId: null });
  restoreNavigation({ stack: [], tab: "courses" });
}
