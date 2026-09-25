// Test helpers for the plan tabs (Courses, Problems, Blocks, Export). Not
// used by the app.
import { act, screen } from "@testing-library/react";
import type { PanelRegistration } from "~/app/registry";
import { renderShell } from "~/app/test-utils";
import type { RailTab } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { seedDemoWorkspace, TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";

export { openPlanNow } from "~/state/testing";

/**
 * The shell with the given feature panels, the fixtures' demo plans (or an
 * empty plan) and the whole term loaded, on `tab`.
 */
export async function renderPlanTab(
  panels: readonly PanelRegistration[],
  tab: RailTab,
  { demo = true }: { demo?: boolean } = {},
) {
  const view = await renderShell({ panels });
  await act(async () => {
    if (demo) seedDemoWorkspace();
    await useCatalog.getState().ensureTerm(TEST_TERM_ID);
    useUi.getState().openTab(tab);
  });
  return {
    ...view,
    sidebar: screen.getByRole("complementary", { name: "Sidebar" }),
  };
}
