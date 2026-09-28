import { expect, type Page, test } from "@playwright/test";

// Main plans and term tags (docs/V2.md §5.5) on `pnpm dev:mock`: the main
// plan's tab carries the red square, a draft's Courses panel says which plan
// counts and makes it main with Undo, deleting the main plan passes main to
// the next tab, and Generate fills its list from the four-year plan's
// semester. Nothing signs in.

test.skip(({ isMobile }) => isMobile, "desktop flows");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // In Fall 2026, so Spring 2027 (the mock catalog's term) is Next.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const tabs = (page: Page) => page.getByRole("navigation", { name: "Plans" });
const toast = (page: Page) => page.locator("[data-sonner-toast]");

test("the main plan is marked, a draft says so, and Make main plan has Undo", async ({
  page,
}) => {
  await page.goto("/schedule/courses?demo=1");
  // Schedule's term is the one you're planning: Next.
  await expect(page.getByRole("button", { name: "Spring 2027" })).toContainText(
    "Next",
  );
  const planA = tabs(page).getByRole("button", { name: "Plan A", exact: true });
  await expect(planA).toHaveAccessibleDescription("Your main plan");
  await expect(
    page.getByRole("heading", { name: "Plan A Main plan" }),
  ).toBeVisible();

  await tabs(page).getByRole("button", { name: "Plan B", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan B Draft" }),
  ).toBeVisible();
  const line = page.getByTestId("draft-line");
  await expect(line).toContainText("Your main plan for Spring 2027 is Plan A.");
  await line.getByRole("button", { name: "Make Plan B main" }).click();
  await expect(toast(page)).toContainText(
    "Plan B is your main plan for Spring 2027",
  );
  await expect(
    page.getByRole("heading", { name: "Plan B Main plan" }),
  ).toBeVisible();
  await expect(
    tabs(page).getByRole("button", { name: "Plan B", exact: true }),
  ).toHaveAccessibleDescription("Your main plan");

  await toast(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("heading", { name: "Plan B Draft" }),
  ).toBeVisible();

  // Deleting the main plan hands main to the next tab.
  await planA.click();
  await page.getByRole("button", { name: "Plan A options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(toast(page)).toContainText("Deleted Plan A");
  await expect(toast(page)).toContainText(
    "Plan B is your main plan for Spring 2027 now.",
  );
  // One plan left: nothing to mark.
  await expect(page.getByRole("heading", { name: "Plan B" })).toBeVisible();
  await expect(page.getByTestId("draft-line")).toHaveCount(0);
});

test("Generate from four-year plan fills the list from the semester and generates", async ({
  page,
}) => {
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  const spring = page.getByRole("region", { name: "Spring 2027", exact: true });
  // Plan tags its semesters the same way.
  await expect(spring.getByText("Next", { exact: true })).toBeVisible();
  for (const [query, name] of [
    ["CMSC351", "Add CMSC351 to Spring 2027"],
    ["cmsc4xx", "Add CMSC4XX to Spring 2027"],
  ] as const) {
    await spring
      .getByRole("button", { name: "Add a course to Spring 2027" })
      .click();
    await page.getByRole("searchbox", { name: "Search courses" }).fill(query);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(spring.getByText(query.toUpperCase())).toBeVisible();
  }

  await page.goto("/schedule/generate?term=202701");
  const from = page.getByTestId("from-four-year");
  await expect(from.getByRole("listitem")).toHaveText([
    "CMSC351",
    "Any CMSC 400-level",
  ]);
  await from
    .getByRole("button", { name: "Generate from four-year plan" })
    .click();
  // What was asked for, pinned over the results.
  await expect(page.getByText("1 course + Any CMSC 400-level")).toBeVisible();
});
