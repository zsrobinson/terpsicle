import { expect, type Page, test } from "@playwright/test";

// Search and course details on `pnpm dev:mock?demo=1`: hover a result for
// its ghosts, open it, switch from the section list; filter chips; grades;
// and the same on a phone, inside the drawer.

let errors: string[] = [];
// Called from each group's beforeEach, after its skip, so a skipped test
// never loads the page.
async function open(page: Page) {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=1");
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
    await expect(result).toContainText("4 sections · 1 fits your plan");

    await result.hover();
    await expect(
      page.getByText("Showing every section of CMSC351. Open it to pick one."),
    ).toBeVisible();
    await expect(calendar(page).locator("[data-ghost]").first()).toBeVisible();

    await result.click();
    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("CMSC351");
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
    await expect(row).toContainText("Current");
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

  test("the Grades tab draws bars", async ({ page }) => {
    await page.keyboard.press("/");
    await searchBox(page).fill("cmsc 351");
    await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: "Grades" }).click();
    const bars = page.getByTestId("grade-bars");
    await expect(bars).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("got an A or B");
    await page.locator("[data-grade]").first().hover();
    await expect(page.getByRole("tooltip")).toContainText(/students · \d+%/);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");
  test.beforeEach(({ page }) => open(page));

  test("search and open a course in the drawer", async ({ page }) => {
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });
    await tabs.getByRole("button", { name: "Search" }).tap();
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
