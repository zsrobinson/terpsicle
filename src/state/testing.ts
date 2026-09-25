// Test helpers for the stores. Not used by the app.

import { mockDataSource } from "~/fixtures";
import { INITIAL_CATALOG_STATE, useCatalog } from "./catalog-store";
import { createBucketDataSource, createDataReader } from "./data-source";
import { useShare } from "./share-store";
import { INITIAL_UI_STATE, useUi } from "./ui-store";
import { INITIAL_WORKSPACE_STATE, useWorkspace } from "./workspace-store";

/** Puts every store back to its first-load state. */
export function resetStores(): void {
  useWorkspace.setState(INITIAL_WORKSPACE_STATE);
  useUi.setState(INITIAL_UI_STATE);
  useCatalog.setState(INITIAL_CATALOG_STATE);
  useShare.setState({ shared: null });
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
