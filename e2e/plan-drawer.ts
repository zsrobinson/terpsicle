import { expect, type Page } from "@playwright/test";

// Plan's phone drawer, shared by the specs that add courses from Search.

/**
 * On a phone, Search raises the drawer over the semesters (all the way
 * while the keyboard is up; half after an add, QA P1): lower it, as a
 * person would, to pick one. The grabber steps half → full → peek.
 */
export async function lowerPlanDrawer(page: Page): Promise<void> {
  const drawer = page.locator("[data-workbench-drawer]");
  await expect(drawer).not.toHaveAttribute("data-snap", "peek");
  const grabber = page.getByRole("button", {
    name: /^(Lower|Raise) the panel$/,
  });
  for (let i = 0; i < 2; i++) {
    const before = await drawer.getAttribute("data-snap");
    if (before === "peek") break;
    await grabber.click();
    await expect(drawer).not.toHaveAttribute("data-snap", before ?? "");
  }
  await expect(drawer).toHaveAttribute("data-snap", "peek");
}
