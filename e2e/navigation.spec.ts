import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// Back, Forward and reload on `pnpm dev:mock?demo=1` (src/app/README.md,
// "URL state"): one Back in the sidebar that is the browser's Back, course
// to course without a trail, typing that never fills history, and a first
// entry that keeps Back in the app. The same on a phone, in the drawer.

let errors: string[] = [];
async function open(page: Page, path = "/schedule?demo=1") {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  await expect(block(page, "CMSC351")).toBeVisible();
}
test.afterEach(() => {
  expect(errors).toEqual([]);
});
/** Reloads, and waits for the calendar as `open` does. */
async function reload(page: Page) {
  await page.reload();
  await expect(block(page, "CMSC351")).toBeVisible();
}

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const block = (page: Page, code: string) =>
  calendar(page)
    .getByRole("button", { name: new RegExp(`^${code} \\d{4}`) })
    .first();
const openView = (page: Page) => page.locator(OPEN_VIEW);
const back = (page: Page, to: string) =>
  page.getByRole("button", { name: `Back to ${to}` });
const historyLength = (page: Page) =>
  page.evaluate(() => window.history.length);
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");
  test.beforeEach(({ page }) => open(page));

  test("course to course, then Back and Back", async ({ page }) => {
    await block(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    await expect(back(page, "Courses")).toBeVisible();

    await block(page, "CMSC330").click();
    await expect(openView(page)).toHaveText("CMSC330");
    // One Back, to where you came from: no trail of crumbs to aim at.
    await expect(back(page, "CMSC351")).toBeVisible();
    await expect(back(page, "Courses")).toHaveCount(0);
    expect(param(page, "course")).toBe("CMSC330");

    await back(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    expect(param(page, "course")).toBe("CMSC351");
    await back(page, "Courses").click();
    await expect(openView(page)).toHaveCount(0);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
    expect(param(page, "course")).toBeNull();
  });

  test("the browser's Back and Forward match the app's Back", async ({
    page,
  }) => {
    await block(page, "CMSC351").click();
    await block(page, "CMSC330").click();
    await expect(openView(page)).toHaveText("CMSC330");

    await page.goBack();
    await expect(openView(page)).toHaveText("CMSC351");
    await expect(back(page, "Courses")).toBeVisible();
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC330");
    await expect(back(page, "CMSC351")).toBeVisible();

    // The app's Back is the browser's: Forward undoes it.
    await back(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC330");

    // Esc is Back too.
    await page.keyboard.press("Escape");
    await expect(openView(page)).toHaveText("CMSC351");
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC330");
  });

  test("the rail and plan tabs are places Back returns to", async ({
    page,
  }) => {
    const tabs = page.getByRole("navigation", { name: "Sidebar tabs" });
    await tabs.getByRole("button", { name: "Travel" }).click();
    await expect(page).toHaveURL(/tab=travel/);
    const plans = page.getByRole("navigation", { name: "Plans" });
    await plans.getByRole("button", { name: "Plan B", exact: true }).click();
    await expect(page).toHaveURL(/planId=plan_demo_b/);
    await expect(page).toHaveTitle(/^Plan B/);

    await page.goBack();
    await expect(page).toHaveURL(/planId=plan_demo_a/);
    await expect(page).toHaveTitle(/^Plan A/);
    await page.goBack();
    await expect(page).toHaveURL(/tab=courses/);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
  });

  test("a reload shows the same view, and Back still works", async ({
    page,
  }) => {
    await block(page, "CMSC351").click();
    await block(page, "CMSC330").click();
    await expect(openView(page)).toHaveText("CMSC330");

    await reload(page);
    await expect(openView(page)).toHaveText("CMSC330");
    await expect(
      page.getByText("Showing every section of CMSC330. Click one to switch."),
    ).toBeVisible();
    await expect(back(page, "CMSC351")).toBeVisible();
    await back(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
  });

  test("typing in Search replaces the entry; opening a result pushes one", async ({
    page,
  }) => {
    await page.keyboard.press("/");
    const box = page.getByRole("combobox", { name: "Search courses" });
    await expect(box).toBeFocused();
    await expect(page).toHaveURL(/tab=search/);
    const before = await historyLength(page);

    await box.pressSequentially("cmsc 351", { delay: 40 });
    await expect(page).toHaveURL(/q=cmsc(\+|%20)351/);
    expect(await historyLength(page)).toBe(before);

    await page.locator('[data-course-result="CMSC351"]').click();
    await expect(openView(page)).toHaveText("CMSC351");
    await expect(back(page, "Search")).toBeVisible();
    expect(await historyLength(page)).toBe(before + 1);

    // Back: the search as it was; Back again: the tab before Search, with
    // no stop for each letter typed.
    await page.goBack();
    await expect(openView(page)).toHaveCount(0);
    await expect(box).toHaveValue("cmsc 351");
    await page.goBack();
    await expect(page).toHaveURL(/tab=courses/);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
  });

  test("a filter chip is a place; a reload keeps the search", async ({
    page,
  }) => {
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search courses" }).fill("cmsc");
    await page.getByRole("button", { name: "Open seats" }).click();
    await expect(page).toHaveURL(/openSeats=1/);

    await reload(page);
    await expect(
      page.getByRole("combobox", { name: "Search courses" }),
    ).toHaveValue("cmsc");
    await expect(
      page.getByRole("button", { name: "Open seats" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goBack();
    await expect(page).not.toHaveURL(/openSeats/);
    await expect(
      page.getByRole("button", { name: "Open seats" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("a link straight to a course has the app under it, so Back stays in the app", async ({
    page,
  }) => {
    await open(page, "/schedule?demo=1&term=202701&course=CMSC330");
    await expect(openView(page)).toHaveText("CMSC330");
    await page.goBack();
    await expect(openView(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/schedule\?/);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");
  test.beforeEach(({ page }) => open(page));

  test("course to course in the drawer, with its Back and the browser's", async ({
    page,
  }) => {
    const drawer = page.locator("[data-snap]");
    await page.getByRole("button", { name: "Raise the panel" }).click();
    await expect(drawer).toHaveAttribute("data-snap", "half");
    await page.getByTestId("course-row-CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    await expect(
      drawer.getByRole("button", { name: "Back to Courses" }),
    ).toBeVisible();

    await block(page, "CMSC330").click();
    await expect(openView(page)).toHaveText("CMSC330");
    await expect(back(page, "CMSC351")).toBeVisible();
    await expect(back(page, "Courses")).toHaveCount(0);

    await page.goBack();
    await expect(openView(page)).toHaveText("CMSC351");
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC330");

    await back(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    await back(page, "Courses").click();
    await expect(openView(page)).toHaveCount(0);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
    await expect(page).toHaveURL(/\/schedule\?/);
  });
});
