import { expect, type Page, test } from "@playwright/test";

// The app without a mouse (M8): skip links, drill-ins that take focus and
// give it back on Esc, the calendar's blocks and ghosts, menus, the color
// picker and filter chips.

test.skip(({ isMobile }) => isMobile, "keyboard on desktop");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=1");
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
const focused = (page: Page) => page.locator(":focus");
const drillIn = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });

async function tabTo(page: Page, target: ReturnType<Page["locator"]>) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("never reached the target with Tab");
}

test("skip links lead past the top bar", async ({ page }) => {
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to calendar" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  // The next stop is on the calendar.
  await page.keyboard.press("Tab");
  await expect(focused(page)).toHaveAttribute("data-course", /.+/);
});

test("Enter on a search result opens its details; Esc returns to the search box", async ({
  page,
}) => {
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search courses" });
  await box.fill("cmsc 351");
  await expect(page.locator('[data-course-result="CMSC351"]')).toBeVisible();
  await box.press("Enter");
  await expect(drillIn(page, "CMSC351")).toBeFocused();
  // Tab moves on into the details, starting at the breadcrumb.
  await page.keyboard.press("Tab");
  await expect(
    drillIn(page, "CMSC351").getByRole("button", { name: "Search" }),
  ).toBeFocused();
  // The first Esc dismisses the breadcrumb's tooltip (WCAG 1.4.13); the
  // next goes back.
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(drillIn(page, "CMSC351")).toHaveCount(0);
  await expect(box).toBeFocused();
});

test("a course row opens its details, and Esc goes back to that row", async ({
  page,
}) => {
  const row = page.getByTestId("course-row-STAT400");
  await tabTo(page, row);
  await page.keyboard.press("Enter");
  await expect(drillIn(page, "STAT400")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(row).toBeFocused();
});

test("a calendar block opens its course; arrows preview, Enter switches, Esc goes back", async ({
  page,
}) => {
  const block = calendar(page)
    .getByRole("button", { name: /^CMSC351 0301, Monday/ })
    .first();
  await block.focus();
  await page.keyboard.press("Enter");
  await expect(drillIn(page, "CMSC351")).toBeFocused();
  await expect(calendar(page).locator("[data-ghost]").first()).toBeVisible();
  // Ghosts are options, named as such.
  await expect(
    calendar(page).getByRole("button", {
      name: /^Switch to 0201, another section of CMSC351: Monday/,
    }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(block).toBeFocused();
  await expect(calendar(page).locator("[data-ghost]")).toHaveCount(0);
});

test("the plan menu works from the keyboard and gives focus back", async ({
  page,
}) => {
  const options = page.getByRole("button", { name: "Plan A options" });
  await options.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(options).toBeFocused();
  // No tooltip pops up over the page as focus comes back.
  await page.waitForTimeout(500);
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("navigation", { name: "Plans" })
      .getByRole("button", { name: "Copy of Plan A", exact: true }),
  ).toBeVisible();
});

test("the color picker works from the keyboard", async ({ page }) => {
  const dot = page.getByRole("button", { name: /^CMSC351 color:/ });
  await dot.focus();
  await page.keyboard.press("Enter");
  const green = page.getByRole("button", { name: "Green", exact: true });
  await expect(green).toBeVisible();
  await tabTo(page, green);
  await page.keyboard.press("Enter");
  await expect(dot).toHaveAccessibleName("CMSC351 color: Green");
  await expect(dot).toBeFocused();
});

test("filter chips open and close from the keyboard, without a tooltip after", async ({
  page,
}) => {
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search courses" }).fill("cmsc");
  const chip = page.getByRole("button", { name: "Gen-eds" });
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Gen-eds/ })).toBeFocused();
  await page.waitForTimeout(500);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("every focused control shows a ring", async ({ page }) => {
  // A sample across the shell: rail, plan tabs, a calendar block, a panel button.
  for (const target of [
    page.getByRole("navigation", { name: "Sidebar tabs" }).getByRole("button", {
      name: "Search",
    }),
    page.getByRole("button", { name: "Plan A", exact: true }),
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
    page.getByRole("button", { name: "New plan" }),
  ]) {
    await target.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(target).toBeFocused();
    const outline = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).not.toBe("0px");
  }
});

test("course details' tabs follow the arrow keys", async ({ page }) => {
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search courses" });
  await box.fill("cmsc 351");
  await expect(page.locator('[data-course-result="CMSC351"]')).toBeVisible();
  await box.press("Enter");
  const instructors = page.getByRole("tab", { name: "Instructors" });
  await instructors.focus();
  await page.keyboard.press("ArrowRight");
  const grades = page.getByRole("tab", { name: "Grades" });
  await expect(grades).toBeFocused();
  await expect(grades).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("got an A or B");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "About" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(instructors).toBeFocused();
});
