// Test helpers for the stores. Not used by the app.

import type { QueryClient } from "@tanstack/react-query";
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
import { useGenerateDrafts } from "./generate-drafts";
import { ensureCampus } from "./query/catalog";
import { connectPublished, usePublishedSource } from "./query/published";
import { INITIAL_SEAT_WATCHES_STATE, useSeatWatches } from "./seat-watches";
import { useShare } from "./share-store";
import { INITIAL_UI_STATE, useUi } from "./ui-store";
import { INITIAL_WORKSPACE_STATE, useWorkspace } from "./workspace-store";

/** Puts every store back to its first-load state. */
export function resetStores(): void {
  useWorkspace.setState(INITIAL_WORKSPACE_STATE);
  useUi.setState(INITIAL_UI_STATE);
  useCatalog.setState(INITIAL_CATALOG_STATE);
  useShare.setState({ shared: null });
  useSeatWatches.setState(INITIAL_SEAT_WATCHES_STATE);
  useGenerateDrafts.setState({ drafts: {} });
}

/**
 * Stores as the app has them once loaded with nothing saved yet: workspace
 * hydrated, terms loaded from the fixtures' mock bucket.
 */
export async function loadStores(): Promise<void> {
  resetStores();
  useWorkspace.setState({ hydrated: true });
  const source = createBucketDataSource(mockDataSource);
  useCatalog.getState().setReader(createDataReader(source));
  // What app.tsx does: published queries read the same files.
  connectPublished(source);
  await useCatalog.getState().loadTerms();
}

/** Loads the campus map into a page's query client, as the shell does once a section is placed. */
export async function loadCampus(client: QueryClient): Promise<void> {
  const { source } = usePublishedSource.getState();
  if (source) await ensureCampus(client, source);
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
