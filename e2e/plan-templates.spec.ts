import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// Terpsicle Plan's sample plans (docs/V3.md §2.11) on `pnpm dev:mock`: from
// the first visit, pick the Computer Science sample, add it in one step, and
// undo it.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Fall 2026: a plan started now counts its eight semesters from here.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function axe(page: Page, what: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `${what} (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** A semester's column; on a phone, picked from the strip first. */
async function semester(page: Page, isMobile: boolean, name: string) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click();
  }
  return page.getByRole("region", { name, exact: true });
}

test("adds the Computer Science sample plan in one step, and undoes it", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Start from a sample plan" }).click();
  await expect(page).toHaveURL(/\/plan\/samples/);

  const card = page.getByRole("region", { name: "Computer Science" });
  await expect(
    card.getByText("Fills 8 empty semesters, from Fall 2026."),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "See the source" }),
  ).toHaveAttribute("href", /^https:\/\//);
  await axe(page, "the Samples tab");

  await card.getByRole("button", { name: "Add to My plan" }).click();
  await expect(
    page.getByText("Added the Computer Science sample plan to 8 semesters"),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/plan\/samples/);
  // Placeholders count at once, courses once their departments load.
  await expect(page.getByText("104 of 120 credits").first()).toBeVisible();
  const first = await semester(page, isMobile, "Fall 2026");
  await expect(first.getByText("MATH140")).toBeVisible();
  await expect(first.getByText("CMSC131")).toBeVisible();
  const last = await semester(page, isMobile, "Spring 2030");
  await expect(last.getByText("Any DVCC course")).toBeVisible();
  await axe(page, "a plan from a sample");

  // One step: Undo takes the whole sample back.
  await page.getByRole("button", { name: "Undo" }).first().click();
  await expect(page.getByText("0 of 120 credits").first()).toBeVisible();
  const emptied = await semester(page, isMobile, "Fall 2026");
  await expect(emptied.getByText("MATH140")).toHaveCount(0);
});
