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
import { createBucketDataSource } from "./data-source";
import { useGenerateDrafts } from "./generate-drafts";
import { ensureCampus } from "./query/catalog";
import { connectPublished, usePublishedSource } from "./query/published";
import { createTestQueryClient } from "./query/testing";
import { useShare } from "./share-store";
import { INITIAL_UI_STATE, useUi } from "./ui-store";
import { INITIAL_WORKSPACE_STATE, useWorkspace } from "./workspace-store";

/** Puts every store back to its first-load state. */
export function resetStores(): void {
  useWorkspace.setState(INITIAL_WORKSPACE_STATE);
  useUi.setState(INITIAL_UI_STATE);
  useCatalog.setState(INITIAL_CATALOG_STATE);
  useShare.setState({ shared: null });
  useGenerateDrafts.setState({ drafts: {} });
}

/**
 * Stores as the app has them once loaded with nothing saved yet: workspace
 * hydrated, terms loaded from the fixtures' mock bucket into `client` (a
 * fresh test client unless given; the page's, in the app). Returns it.
 * An options object, so `beforeEach(loadStores)` (which passes the test's
 * context) still gets a fresh client.
 */
export async function loadStores({
  client = createTestQueryClient(),
}: {
  client?: QueryClient;
} = {}): Promise<QueryClient> {
  resetStores();
  useWorkspace.setState({ hydrated: true });
  const source = createBucketDataSource(mockDataSource);
  // What app.tsx does: the catalog and every published query read the
  // same files, through the page's client.
  useCatalog.getState().connect(client, source);
  connectPublished(source);
  await useCatalog.getState().loadTerms();
  return client;
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
