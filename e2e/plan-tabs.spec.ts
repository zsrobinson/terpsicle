import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Courses, Problems, Blocks and Export on `pnpm dev:mock` (M4 part B): the
// first-visit paths, remove with undo, a one-click fix, a block from the
// form, and everything Export hands off (codes, .ics, share link).

test.skip(({ isMobile }) => isMobile, "desktop interactions");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Sidebar" });
const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

async function openDemo(page: Page) {
  await page.goto("/?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
}

async function openTab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

test("first visit shows two equal ways to start", async ({ page }) => {
  await page.goto("/");
  const guide = page.getByTestId("first-visit");
  await expect(
    guide.getByRole("heading", { name: "Build your Spring 2027 schedule" }),
  ).toBeVisible();
  const build = guide.getByRole("group", { name: "Build it yourself" });
  const generate = guide.getByRole("group", { name: "Generate plans" });
  const [a, b] = await Promise.all([
    build.boundingBox(),
    generate.boundingBox(),
  ]);
  if (!a || !b) throw new Error("paths not measured");
  // Side by side, the same size.
  expect(a.width).toBeCloseTo(b.width, 0);
  expect(a.height).toBeCloseTo(b.height, 0);
  expect(a.y).toBeCloseTo(b.y, 0);

  await build.getByRole("button", { name: "Search for a course" }).click();
  await expect(
    sidebar(page).getByRole("heading", { name: "Search" }),
  ).toBeVisible();

  await openTab(page, "Courses");
  await generate.getByRole("button", { name: "Generate plans" }).click();
  await expect(
    sidebar(page).getByRole("heading", { name: "Generate" }),
  ).toBeVisible();
});

test("remove a course from the plan, then undo", async ({ page }) => {
  await openDemo(page);
  const row = page.getByTestId("course-row-ENGL393");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from plan" }).click();
  await expect(row).toHaveCount(0);
  await expect(
    calendar(page).getByRole("button", { name: /^ENGL393/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Removed ENGL393 from Plan A")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeVisible();
  await expect(
    calendar(page)
      .getByRole("button", { name: /^ENGL393/ })
      .first(),
  ).toBeVisible();
});

test("fix a problem with one click", async ({ page }) => {
  await openDemo(page);
  await openTab(page, "Problems");
  const overlap = page.getByTestId("problem-overlap");
  await expect(overlap).toBeVisible();
  const fix = overlap.getByRole("button", { name: /^Switch / });
  await fix.click();
  await expect(overlap).toHaveCount(0);
  await expect(page.getByText(/^Switched ENGL393 to /)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /\d+ problems?/ }).first(),
  ).toBeVisible();
});

test("add a block from the Blocks form", async ({ page }) => {
  await openDemo(page);
  await openTab(page, "Blocks");
  // The demo has a block, so the form waits behind "Add a block".
  await page.getByRole("button", { name: "Add a block" }).click();
  const form = page.getByRole("form", { name: "Add block" });
  await form.getByRole("button", { name: "Lunch" }).click();
  await form.getByRole("combobox", { name: "Starts" }).click();
  await page.getByRole("option", { name: "12pm" }).click();
  await form.getByRole("combobox", { name: "Ends" }).click();
  await page.getByRole("option", { name: "1pm" }).click();
  await form.getByRole("button", { name: "Add block" }).click();
  await expect(
    page.getByRole("list", { name: "Blocks" }).getByText("Lunch"),
  ).toBeVisible();
  await expect(
    calendar(page)
      .getByRole("button", { name: /^Lunch, \w+day 12pm to 1pm/ })
      .first(),
  ).toBeVisible();
});

test.describe("export", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy section codes", async ({ page }) => {
    await openDemo(page);
    await openTab(page, "Export");
    await page
      .getByRole("button", { name: /Copy course and section codes/ })
      .click();
    await expect(page.getByText("Copied 5 section codes")).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.split("\n")).toEqual([
      "CMSC351 0301",
      "CMSC330 0103",
      "STAT400 0101",
      "ENGL393 0101",
      "ECON200 0101",
    ]);
  });

  test("download the .ics", async ({ page }) => {
    await openDemo(page);
    await openTab(page, "Export");
    const button = page.getByRole("button", { name: /Add to your calendar/ });
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toBe("terpsicle-spring-2027.ics");
    const path = await download.path();
    const ics = readFileSync(path, "utf8");
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("X-WR-TIMEZONE:America/New_York");
    expect(ics).toMatch(/SUMMARY:CMSC351/);
    expect(ics).toMatch(/RRULE:FREQ=WEEKLY/);
    expect(ics.match(/BEGIN:VEVENT/g)?.length ?? 0).toBeGreaterThan(5);
  });

  test("copy the share link, then open it", async ({ page }) => {
    await openDemo(page);
    await openTab(page, "Export");
    await page.getByRole("button", { name: /Copy share link/ }).click();
    await expect(page.getByText("Copied the share link")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(link).searchParams.has("plan")).toBe(true);

    await page.goto(link);
    await expect(
      page.getByRole("banner").getByText("Shared plan"),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Plans" })).toHaveCount(
      0,
    );
    await expect(
      calendar(page)
        .getByRole("button", { name: /^CMSC351 0301/ })
        .first(),
    ).toBeVisible();
    // Read-only: no edit controls in the Courses tab.
    await openTab(page, "Courses");
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Actions for CMSC351" }),
    ).toHaveCount(0);
  });
});

test("a seat-alert email's link opens that course in its term", async ({
  page,
}) => {
  await page.goto("/?term=202605&course=CMSC131");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("CMSC131");
  await expect(page.getByRole("button", { name: /Summer 2026/ })).toBeVisible();
  await expect(page).toHaveURL((url) => !url.searchParams.has("term"));
});
