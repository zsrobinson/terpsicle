import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// Search and course details on `pnpm dev:mock?demo=1`: hover a result for
// its ghosts, open it, switch from the section list; filter chips; course
// details at one, a few and many sections, with grades;
// and the same on a phone, inside the drawer.

let errors: string[] = [];
// Called from each group's beforeEach, after its skip, so a skipped test
// never loads the page.
async function open(page: Page) {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
}
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search courses" });
const results = (page: Page) => page.getByRole("listbox");
const matchCount = async (page: Page) =>
  Number((await results(page).getAttribute("aria-label"))?.split(" ")[0]);

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop interactions");
  test.beforeEach(({ page }) => open(page));

  test("search, hover for ghosts, open, and switch from the list", async ({
    page,
  }) => {
    await page.keyboard.press("/");
    await expect(searchBox(page)).toBeFocused();
    await searchBox(page).fill("cmsc 351");
    const result = page.locator('[data-course-result="CMSC351"]');
    await expect(result).toContainText("4 sections · 1 fit");

    await result.hover();
    await expect(
      page.getByText("Showing every section of CMSC351. Open it to pick one."),
    ).toBeVisible();
    await expect(calendar(page).locator("[data-ghost]").first()).toBeVisible();

    await result.click();
    await expect(page.locator(OPEN_VIEW)).toContainText("CMSC351");
    await expect(
      page.getByRole("heading", { name: "Algorithms" }),
    ).toBeVisible();

    const row = page.locator('[data-section="0401"]');
    await expect(row).toContainText("Overlaps CMSC330");
    await row.getByRole("button", { name: "Switch" }).click();
    await expect(page.getByText("Switched CMSC351 to 0401")).toBeVisible();
    await expect(
      calendar(page)
        .getByRole("button", { name: /^CMSC351 0401/ })
        .first(),
    ).toBeVisible();
    await expect(row).toContainText("In Plan A");
  });

  test("hovering results never moves the calendar", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc");
    const block = calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first();
    const before = await block.boundingBox();
    const rows = page.locator("[data-course-result]");
    for (const i of [0, 1, 2]) {
      await rows.nth(i).hover();
      await expect(page.getByText(/^Showing /)).toBeVisible();
      expect(await block.boundingBox()).toEqual(before);
    }
    // Leaving the results keeps the hint's row; the day names never hide.
    await page.mouse.move(0, 0);
    await expect(page.getByText(/^Showing /)).toHaveCount(0);
    expect(await block.boundingBox()).toEqual(before);
  });

  test("a one-section course says when it meets", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc425");
    const result = page.locator('[data-course-result="CMSC425"]');
    await expect(result).toContainText("TuTh 2pm–3:15pm");
    await expect(page.getByText(/^\d+ courses?$/)).toBeVisible();
  });

  test("filter chips narrow the results", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc");
    await expect(results(page)).toBeVisible();
    const all = await matchCount(page);

    await page.getByRole("button", { name: "Level" }).click();
    await page.getByRole("menuitemcheckbox", { name: "400-level" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => matchCount(page)).toBeLessThan(all);
    for (const code of await page
      .locator("[data-course-result]")
      .evaluateAll((rows) =>
        rows.map((r) => r.getAttribute("data-course-result")),
      ))
      expect(code).toMatch(/^CMSC4/);

    const narrowed = await matchCount(page);
    await page.getByRole("button", { name: "Open seats" }).click();
    await expect(
      page.getByRole("button", { name: "Open seats" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => matchCount(page)).toBeLessThanOrEqual(narrowed);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => matchCount(page)).toBe(all);
  });

  test("course details: facts first, Grades a click away", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc 351");
    await page.keyboard.press("Enter");
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    // The prerequisite shows without scrolling, and there are no tabs.
    await expect(sidebar.getByText("Prerequisite")).toBeInViewport();
    await expect(sidebar.getByRole("tab")).toHaveCount(0);

    await page.getByRole("button", { name: "Grades ↓" }).click();
    const grades = page.getByTestId("grades");
    await expect(grades.getByTestId("grade-bars")).toBeInViewport();
    await expect(grades).toContainText("got an A or B");
    await grades.locator("[data-grade]").first().hover();
    await expect(page.getByRole("tooltip")).toContainText(/students · \d+%/);
  });

  test("course details at one and many sections", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc 401");
    await page.locator('[data-course-result="CMSC401"]').click();
    // One section: the same row as any other course, with a plus to add it.
    const sections = page.getByTestId("sections");
    const only = sections.locator('[data-section="0101"]');
    await expect(only).toContainText("TuTh 12:30–1:45pm");
    await expect(only).toContainText("ESJ 1309");
    await only.getByRole("button", { name: "Add 0101" }).click();
    await expect(only).toContainText("In Plan A");
    await expect(
      only.getByRole("button", { name: "Remove 0101 from Plan A" }),
    ).toBeVisible();

    // Many: one list (nobody's named yet), your section pinned on top.
    await page.keyboard.press("/");
    await searchBox(page).fill("engl 101");
    await page.locator('[data-course-result="ENGL101"]').click();
    await expect(
      sections.getByText(
        "Testudo hasn't named instructors for these sections yet.",
      ),
    ).toBeVisible();
    await sections
      .locator('[data-section="0101"]')
      .getByRole("button", { name: "Add 0101" })
      .click();
    await expect(page.getByTestId("your-section")).toContainText("In Plan A");
    const rows = sections.locator("[data-section]");
    const before = await rows.count();
    await page.getByRole("button", { name: "Only fits" }).click();
    await expect.poll(() => rows.count()).toBeLessThan(before);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");
  test.beforeEach(({ page }) => open(page));

  test("search and open a course in the drawer", async ({ page }) => {
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });
    await tabs.getByRole("button", { name: "Search" }).tap();
    // A finger taps to open; only a mouse hovers to preview.
    await expect(page.getByTestId("search-hint-tap")).toBeVisible();
    await expect(page.getByTestId("search-hint-hover")).toBeHidden();
    await searchBox(page).fill("cmsc 351");
    await page.locator('[data-course-result="CMSC351"]').tap();

    const drawer = page.locator("[data-vaul-drawer]");
    await expect(
      drawer.getByRole("heading", { name: "Algorithms" }),
    ).toBeVisible();
    await expect(drawer.getByTestId("sections")).toBeVisible();
    await expect(
      page.getByText("Showing every section of CMSC351. Click one to switch."),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
