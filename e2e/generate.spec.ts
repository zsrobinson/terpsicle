import { expect, type Page, test } from "@playwright/test";

// Generate on `pnpm dev:mock?demo=1` (SPEC §3.9): list courses, generate,
// preview a result on the calendar, save two as plans; and when nothing
// fits, apply a suggested relaxation.

test.skip(({ isMobile }) => isMobile, "desktop flows");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  // The first load compiles the app and reads every department of the mock
  // term; with several workers on one dev server that can take a while.
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const planTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Plans" }).getByRole("listitem");
const courseField = (page: Page) =>
  page.getByRole("combobox", { name: "Add a course" });

async function addCourse(page: Page, code: string) {
  await courseField(page).fill(code);
  await expect(
    page
      .getByRole("listbox", { name: "Suggested courses" })
      .getByRole("option")
      .first(),
  ).toContainText(code);
  await courseField(page).press("Enter");
  await expect(page.getByTestId(`gen-course-${code}`)).toBeVisible();
}

test("generate from four courses, preview one, and save two as plans", async ({
  page,
}) => {
  // `+` → Generate plans… opens the tab with the course field focused.
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByRole("menuitem", { name: /Generate plans/ }).click();
  await expect(courseField(page)).toBeFocused();

  for (const code of ["CMSC351", "CMSC330", "STAT400", "ENGL393"])
    await addCourse(page, code);
  await page.getByRole("button", { name: "Generate plans" }).click();
  const results = page.getByRole("list", { name: "Generated plans" });
  await expect(results.getByRole("listitem").first()).toBeVisible();

  // Clicking a result previews it and drills into its details.
  await results.getByRole("button").first().click();
  await expect(page.getByText("Previewing Option 1.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Option 1");
  await expect(
    page.getByText("Changes from Plan A", { exact: true }),
  ).toBeVisible();

  // Back to the list: the preview goes away with the details.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Previewing Option 1.")).toHaveCount(0);

  await page
    .getByRole("checkbox", { name: "Select Option 1", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Option 2", exact: true })
    .check();
  await page.getByRole("button", { name: "Save 2 plans" }).click();
  await expect(planTabs(page)).toHaveText([
    "Plan A",
    "Plan B",
    "Plan C",
    "Plan D",
  ]);
  await expect(
    planTabs(page).getByRole("button", { name: "Plan C", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Saved 2 plans")).toBeVisible();
});

test("when nothing fits, apply a suggested relaxation", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: "Generate" })
    .click();
  await addCourse(page, "CMSC351");
  await addCourse(page, "CMSC330");
  await page.getByRole("combobox", { name: "Start after" }).click();
  await page.getByRole("option", { name: "1pm" }).click();
  await page.getByRole("button", { name: "Generate plans" }).click();

  // The form gives way to a one-line summary of what was asked.
  await expect(
    page.getByText("2 courses · from 1pm · compact days"),
  ).toBeVisible();
  const nothing = page.getByTestId("nothing-fits");
  await expect(nothing).toContainText("Nothing fits all of that.");
  await expect(
    nothing.getByRole("list", { name: "Closest plans" }).getByRole("listitem"),
  ).not.toHaveCount(0);
  const relax = nothing.getByRole("button", {
    name: /^Allow classes before 1pm/,
  });
  await expect(relax).toBeVisible();
  await relax.click();

  await expect(
    page.getByRole("list", { name: "Generated plans" }).getByRole("listitem"),
  ).not.toHaveCount(0);
  await expect(page.getByText("2 courses · compact days")).toBeVisible();
  // The loosened must-have is in the form too.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("combobox", { name: "Start after" })).toHaveText(
    "Any time",
  );
});
