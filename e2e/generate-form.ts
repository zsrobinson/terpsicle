import { expect, type Page } from "@playwright/test";

// Generate's course list, shared by the specs that build one.

/**
 * Empties the list. An untouched form starts with the open plan's courses
 * (QA S16), so a spec that builds its own list from the demo's Plan A
 * removes them first, as a person would.
 */
export async function clearGenerateCourses(page: Page): Promise<void> {
  await expect(
    page.getByRole("combobox", { name: "Add a course" }),
  ).toBeVisible();
  const chips = page.locator('[data-testid^="gen-course-"]');
  for (let n = await chips.count(); n > 0; n--) {
    await chips
      .first()
      .getByRole("button", { name: /^Remove / })
      .click();
    await expect(chips).toHaveCount(n - 1);
  }
}
