import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

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

/**
 * Opens the demo and waits until it's ready for what the test does first:
 * by default the calendar's CMSC351, which needs the term's catalog too.
 */
async function openDemo(
  page: Page,
  ready: (page: Page) => Promise<void> = (p) =>
    expect(
      calendar(p)
        .getByRole("button", { name: /^CMSC351 0301/ })
        .first(),
    ).toBeVisible(),
) {
  await page.goto("/schedule?demo=1");
  await ready(page);
}

/**
 * The demo plan's rows in Courses, which come before the term's catalog. On
 * a cold page they can take most of 5 s (the app's modules, unbundled), so
 * they're waited for as the test's first action would, not asserted.
 */
const demoRows = (page: Page) =>
  page.getByTestId("course-row-CMSC351").waitFor();

async function openTab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

test("first visit shows two equal ways to start", async ({ page }) => {
  await page.goto("/schedule");
  const guide = page.getByTestId("first-visit");
  await expect(
    guide.getByRole("heading", { name: "Build your Spring 2027 schedule" }),
  ).toBeVisible();
  const build = guide.getByRole("button", { name: "Search for a course" });
  const generate = guide.getByRole("button", { name: "Generate plans" });
  const [a, b] = await Promise.all([
    build.boundingBox(),
    generate.boundingBox(),
  ]);
  if (!a || !b) throw new Error("paths not measured");
  // Both filled, the same height: neither path is styled as the default.
  expect(a.height).toBeCloseTo(b.height, 0);
  expect(await build.getAttribute("class")).toBe(
    await generate.getAttribute("class"),
  );

  await build.click();
  await expect(
    sidebar(page).getByRole("heading", { name: "Search" }),
  ).toBeVisible();

  await openTab(page, "Courses");
  await generate.click();
  await expect(
    sidebar(page).getByRole("heading", { name: "Generate" }),
  ).toBeVisible();
});

test("remove a course from the plan, then undo", { tag: "@critical" }, async ({
  page,
}) => {
  await openDemo(page, demoRows);
  const row = page.getByTestId("course-row-ENGL393");
  // Its blocks are checked too, so they must be there first: they wait for
  // the term's catalog, as a click on one would.
  await calendar(page)
    .getByRole("button", { name: /^ENGL393/ })
    .first()
    .waitFor();
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

test("fix a problem with one click", { tag: "@critical" }, async ({ page }) => {
  await openDemo(page, demoRows);
  await openTab(page, "Problems");
  const overlap = page.getByTestId("problem-overlap");
  // Problems needs the term's catalog: the click waits for the fix to show.
  await overlap.getByRole("button", { name: /^Switch / }).click();
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

test.describe("register", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copy section codes", async ({ page }) => {
    await openDemo(page);
    await openTab(page, "Register");
    await page
      .getByRole("button", { name: /Copy all course and section codes/ })
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

  test("mark a section Registered: its block says so, and it isn't a problem", async ({
    page,
  }) => {
    await openDemo(page);
    await openTab(page, "Register");
    const row = page.getByTestId("checklist-ENGL393-0101");
    await row.getByRole("button", { name: "Copy 0101" }).click();
    await expect(page.getByText("Copied 0101")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "0101",
    );
    await row
      .getByRole("checkbox", { name: "Registered for ENGL393 0101" })
      .check();
    await expect(row).toContainText("Registered");
    await expect(
      calendar(page)
        .getByRole("button", { name: /^ENGL393 0101.*, registered/ })
        .first(),
    ).toBeVisible();
    // Saved with the plan: a fresh load (without `demo`, which would put the
    // demo plans back) still has it.
    await page.goto("/schedule/register");
    await expect(
      page.getByRole("checkbox", { name: "Registered for ENGL393 0101" }),
    ).toBeChecked();
    await openTab(page, "Problems");
    await expect(
      sidebar(page).getByText(/ENGL393 0101 has \d+ seats? left/),
    ).toHaveCount(0);
  });

  test("download the .ics", { tag: "@critical" }, async ({ page }) => {
    await openDemo(page, demoRows);
    await openTab(page, "Register");
    const button = page.getByRole("button", { name: /Add to your calendar/ });
    // It's aria-disabled until the plan's sections are read from the term's
    // catalog; the click waits for it to be enabled.
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

  test("copy the share link from Share, then open it", async ({ page }) => {
    await openDemo(page);
    // An icon in the family bar (docs/decisions.md, "One bar at the top").
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Share" })
      .click();
    const popover = page.getByRole("dialog", { name: "Share Plan A" });
    await expect(popover).toContainText("in the URL itself");
    await popover.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Copied link")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    await expect(
      popover.getByRole("textbox", { name: "Share link" }),
    ).toHaveValue(link);
    expect(new URL(link).pathname).toBe("/schedule");
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
    // Read-only: no edit controls in the Courses tab. (Search first: the
    // open tab's own button would collapse the sidebar.)
    await openTab(page, "Search");
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
  await page.goto("/schedule?term=202605&course=CMSC131");
  await expect(page.locator(OPEN_VIEW)).toContainText("CMSC131");
  await expect(page.getByRole("button", { name: /Summer 2026/ })).toBeVisible();
  // The link is replaced by the course's own URL, naming the tab under it
  // and keeping the term; Back goes to the term's Courses, not out of the app.
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/schedule/course/CMSC131" &&
      url.searchParams.get("term") === "202605" &&
      url.searchParams.get("tab") === "courses",
  );
  await page.getByRole("button", { name: "Back to Courses" }).click();
  await expect(page.locator(OPEN_VIEW)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Summer 2026/ })).toBeVisible();
});
