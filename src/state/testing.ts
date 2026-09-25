// Test helpers for the stores. Not used by the app.

import type { Plan, TermId } from "~/core/schema";
import {
  demoBlocks,
  demoCourseColors,
  demoPlan,
  demoPlans,
  fixtureTermId,
  mockDataSource,
} from "~/fixtures";
import { INITIAL_CATALOG_STATE, useCatalog } from "./catalog-store";
import { createBucketDataSource, createDataReader } from "./data-source";
import { INITIAL_SEAT_ALERTS_STATE, useSeatAlerts } from "./seat-alerts";
import { useShare } from "./share-store";
import { INITIAL_UI_STATE, useUi } from "./ui-store";
import { INITIAL_WORKSPACE_STATE, useWorkspace } from "./workspace-store";

/** Puts every store back to its first-load state. */
export function resetStores(): void {
  useWorkspace.setState(INITIAL_WORKSPACE_STATE);
  useUi.setState(INITIAL_UI_STATE);
  useCatalog.setState(INITIAL_CATALOG_STATE);
  useShare.setState({ shared: null });
  useSeatAlerts.setState(INITIAL_SEAT_ALERTS_STATE);
}

/**
 * Stores as the app has them once loaded with nothing saved yet: workspace
 * hydrated, terms loaded from the fixtures' mock bucket.
 */
export async function loadStores(): Promise<void> {
  resetStores();
  useWorkspace.setState({ hydrated: true });
  useCatalog
    .getState()
    .setReader(createDataReader(createBucketDataSource(mockDataSource)));
  await useCatalog.getState().loadTerms();
}

/** The fixtures' term, whose catalog the mock bucket serves. */
export const TEST_TERM_ID: TermId = fixtureTermId;

/** A returning student's workspace: the demo plans (Plan A open), blocks and colors. */
export function seedDemoWorkspace(): void {
  useWorkspace.setState({
    plans: [...demoPlans],
    blocks: [...demoBlocks],
    colors: Object.fromEntries(
      demoCourseColors.map((c) => [c.courseCode, c.color]),
    ),
    activePlanByTerm: { [demoPlan.termId]: demoPlan.id },
  });
}

/** The open plan in the test term, as the store has it now. */
export function openPlanNow(): Plan | undefined {
  const w = useWorkspace.getState();
  const id = w.activePlanByTerm[TEST_TERM_ID];
  return w.plans.find((p) => p.id === id);
}
