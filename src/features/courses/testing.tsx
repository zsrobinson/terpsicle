// Test helpers for the plan tabs (Courses, Problems, Blocks, Register). Not
// used by the app.
import { act, screen } from "@testing-library/react";
import { renderShell, type ShellRoutes, showTab } from "~/app/test-utils";
import type { RailTab } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { seedDemoWorkspace, TEST_TERM_ID } from "~/state/testing";

export { openPlanNow } from "~/state/testing";

/**
 * The shell with the given features' routes, the fixtures' demo plans (or an
 * empty plan) and the whole term loaded, on `tab`.
 */
export async function renderPlanTab(
  routes: readonly ShellRoutes[],
  tab: RailTab,
  { demo = true }: { demo?: boolean } = {},
) {
  const view = await renderShell({ routes });
  await act(async () => {
    if (demo) seedDemoWorkspace();
    await useCatalog.getState().ensureTerm(TEST_TERM_ID);
  });
  showTab(tab);
  return {
    ...view,
    sidebar: screen.getByRole("complementary", { name: "Sidebar" }),
  };
}
