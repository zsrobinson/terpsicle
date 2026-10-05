import { expect, type Page, test } from "@playwright/test";
import { clearGenerateCourses } from "./generate-form";
import { OPEN_VIEW } from "./sidebar";

// Generate on `pnpm dev:mock?demo=1` (SPEC §3.9): start from Plan A's
// courses, generate, re-rank with a chip, preview a result on the calendar
// and add it as Plan C; and when nothing fits, apply a suggested relaxation.

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

test("generate from Plan A's courses, re-rank with a chip, and add one as Plan C", {
  tag: "@critical",
}, async ({ page }) => {
  // `+` → Generate plans… opens the tab with the course field focused.
  await page.getByRole("button", { name: "New plan" }).click();
  await page.getByRole("menuitem", { name: /Generate plans/ }).click();
  await expect(courseField(page)).toBeFocused();

  // It starts with Plan A's courses: placed ones required, bookmarked ones
  // optional. Keep four.
  await expect(page.getByText(/^From Plan A\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CMSC351, required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "MUSC130, optional" }),
  ).toBeVisible();
  for (const code of ["ECON200", "MUSC130", "PHIL140"]) {
    await page.getByRole("button", { name: `Remove ${code}` }).click();
    await expect(page.getByTestId(`gen-course-${code}`)).toHaveCount(0);
  }
  for (const code of ["CMSC351", "CMSC330", "STAT400", "ENGL393"])
    await expect(page.getByTestId(`gen-course-${code}`)).toBeVisible();
  await page.getByRole("button", { name: "Generate plans" }).click();
  const results = page.getByRole("list", { name: "Generated plans" });
  await expect(results.getByRole("listitem").first()).toBeVisible();

  // The chips sit over the results; a preference re-ranks them in place.
  const prefs = page.getByRole("group", { name: "Preferences" });
  await prefs.getByRole("button", { name: "Later starts: off" }).click();
  await expect(
    prefs.getByRole("button", { name: "Later starts: on" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/prefer=/);
  await expect(results).toHaveAttribute("aria-busy", "false");
  await expect(
    results
      .getByTestId("rank-marks")
      .first()
      .getByText(/ avg start$/),
  ).toBeVisible();

  // Hovering a chip opens its card: how the plans spread out on what it
  // ranks by, the top plan marked. (The pointer is still on the chip it
  // clicked, and a click closes a tooltip until the pointer comes back.)
  await page.getByRole("heading", { name: "Generate" }).first().hover();
  await prefs.getByRole("button", { name: "Later starts: on" }).hover();
  const card = page.getByRole("tooltip");
  await expect(card).toContainText("Average start of a class day");
  await expect(card.getByTestId("chip-spread")).toBeVisible();
  await expect(card).toContainText(/Your top plan:.* avg start/);
  await page.getByRole("heading", { name: "Generate" }).first().hover();
  await expect(card).toHaveCount(0);

  // Hovering a result previews it, like Search; moving away ends it.
  await results.getByTestId("generated-plan").nth(1).hover();
  await expect(page.getByText("Previewing Option 2.")).toBeVisible();
  await page.getByRole("heading", { name: "Generate" }).first().hover();
  await expect(page.getByText("Previewing Option 2.")).toHaveCount(0);

  // A result's arrow previews it and opens every course and section.
  await results.getByRole("button", { name: /^Option 1: / }).click();
  await expect(page.getByText("Previewing Option 1.")).toBeVisible();
  await expect(page.locator(OPEN_VIEW)).toContainText("Option 1");
  await expect(page.getByText("Compared with Plan A")).toBeVisible();
  // A row per section, then the courses from Plan A it leaves out.
  const sections = page.getByRole("list", { name: "Courses and sections" });
  await expect(sections.locator("[data-testid^=result-section-]")).toHaveCount(
    4,
  );
  await expect(sections.getByText("Left out of this plan")).toHaveCount(3);

  // Back to the list: the preview goes away with the details. (With the
  // mouse off the list: over a result, it would preview that one.)
  await calendar(page).hover();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Previewing Option 1.")).toHaveCount(0);

  // The second one, added: it's the next plan, and it opens. (The bar folds
  // the other plans into "+2" when it's short of room, so only the open
  // tab is checked by name.)
  await results.getByRole("button", { name: /^Option 2: / }).click();
  await page.getByRole("button", { name: "Add as Plan C" }).click();
  const planC = planTabs(page).getByRole("button", {
    name: "Plan C",
    exact: true,
  });
  await expect(planC).toHaveAttribute("aria-current", "true");
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toContainText("Added Plan C");

  // Undo takes it away again, back to Plan A.
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(planC).toHaveCount(0);
  await expect(
    planTabs(page).getByRole("button", { name: "Plan A", exact: true }),
  ).toHaveAttribute("aria-current", "true");
});

test("when nothing fits, apply a suggested relaxation", async ({ page }) => {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: "Generate" })
    .click();
  await clearGenerateCourses(page);
  await addCourse(page, "CMSC351");
  await addCourse(page, "CMSC330");
  const filters = page.getByRole("group", { name: "Filters" });
  await filters
    .getByRole("button", { name: "No classes before: any time" })
    .click();
  await page
    .getByRole("menuitemradio", { name: "No classes before 1pm" })
    .click();
  await page.getByRole("button", { name: "Generate plans" }).click();

  // The form gives way to a line of the courses, with the chips under it.
  await expect(page.getByText("2 courses", { exact: true })).toBeVisible();
  await expect(
    filters.getByRole("button", {
      name: "No classes before: No classes before 1pm",
    }),
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
  // The loosened filter is off in the chips, and in the form too.
  await expect(
    filters.getByRole("button", { name: "No classes before: any time" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Filters" })
      .getByRole("button", { name: "No classes before: any time" }),
  ).toBeVisible();
});
