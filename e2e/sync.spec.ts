import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

// Plan sync in test mode (docs/V2.md §5, §4.6): the real /api/sync routes
// over the dev server's local D1, and two browser contexts signed in as the
// same person, as two devices would be. Each test signs in as its own
// throwaway person (`e2e…`, test mode only), so tests never share an account.

test.skip(({ isMobile }) => isMobile, "two devices, desktop interactions");

let errors: string[] = [];
const contexts: BrowserContext[] = [];

test.beforeEach(() => {
  errors = [];
});

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(errors).toEqual([]);
});

/** A fresh browser profile: its own IndexedDB, as another device has. */
async function device(browser: Browser, baseURL?: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}

function newUser(): string {
  return `e2e${Math.random().toString(36).slice(2, 12)}`;
}

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const planTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Plans" }).getByRole("listitem");
const syncStatus = (page: Page) =>
  page.getByRole("banner").locator("[data-sync-status]");
const accountButton = (page: Page) =>
  page.getByRole("banner").getByRole("button", { name: "Account: E2E Tester" });

async function openScheduler(page: Page, path = "/schedule") {
  await page.goto(path);
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
}

/** The demo's plans, saved in this browser while signed out. */
async function openDemo(page: Page) {
  await openScheduler(page, "/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
}

/** Test sign-in, as /auth/test's button does it, then back to the scheduler. */
async function signIn(page: Page, userId: string) {
  if (!page.url().startsWith("http")) await openScheduler(page);
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/schedule" }),
    });
    const result: { status: string; return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  expect(next).toContain("/schedule");
  await page.goto(next);
  await expect(accountButton(page)).toBeVisible();
}

async function saved(page: Page) {
  await expect(syncStatus(page)).toHaveAttribute("data-sync-status", "saved");
}

/** Pressing the status icon checks with the account now. */
async function pull(page: Page) {
  await syncStatus(page).click();
  await saved(page);
}

async function removeCourse(page: Page, code: string) {
  await page.getByTestId(`course-row-${code}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from plan" }).click();
  await expect(page.getByTestId(`course-row-${code}`)).toHaveCount(0);
}

test("the first sign-in with plans here uploads them, and another device gets them", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const laptop = await device(browser, baseURL);
  await openDemo(laptop);
  await signIn(laptop, user);
  await expect(
    laptop.getByText("Your 3 plans are saved to your account"),
  ).toBeVisible();
  await saved(laptop);
  await expect(planTabs(laptop)).toHaveText(["Plan A", "Plan B"]);

  const phone = await device(browser, baseURL);
  await openScheduler(phone);
  await signIn(phone, user);
  await saved(phone);
  // The app's own empty "Plan A" gives way to the account's plans.
  await expect(planTabs(phone)).toHaveText(["Plan A", "Plan B"]);
  await expect(phone.getByTestId("course-row-ENGL393")).toBeVisible();
});

test("edits on one device show on the other after a pull", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const a = await device(browser, baseURL);
  await openDemo(a);
  await signIn(a, user);
  await saved(a);
  const b = await device(browser, baseURL);
  await signIn(b, user);
  await expect(b.getByTestId("course-row-ENGL393")).toBeVisible();

  await removeCourse(a, "ENGL393");
  await saved(a);
  await pull(b);
  await expect(b.getByTestId("course-row-ENGL393")).toHaveCount(0);
  await expect(b.getByTestId("course-row-CMSC351")).toBeVisible();
});

test("the same plan changed on two devices, one offline, keeps both", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const a = await device(browser, baseURL);
  await openDemo(a);
  await signIn(a, user);
  await saved(a);
  const b = await device(browser, baseURL);
  await signIn(b, user);
  await saved(b);

  await b.context().setOffline(true);
  await removeCourse(b, "CMSC351");
  await expect(syncStatus(b)).toHaveAttribute("data-sync-status", "offline");
  await expect(syncStatus(b)).toHaveAccessibleName(
    "Offline, will save when you're back",
  );

  await removeCourse(a, "ENGL393");
  await saved(a);

  await b.context().setOffline(false);
  await expect(
    b.getByText("Your changes are kept as Plan A (copy)"),
  ).toBeVisible();
  await saved(b);
  await expect(planTabs(b)).toHaveText(["Plan A", "Plan B", "Plan A (copy)"]);
  // The plan itself is the other device's version.
  await planTabs(b)
    .filter({ hasText: /^Plan A$/ })
    .click();
  await expect(b.getByTestId("course-row-ENGL393")).toHaveCount(0);
  await expect(b.getByTestId("course-row-CMSC351")).toBeVisible();

  await pull(a);
  await expect(planTabs(a)).toHaveText(["Plan A", "Plan B", "Plan A (copy)"]);
});

test("signing out keeps this device's plans", async ({ browser, baseURL }) => {
  const page = await device(browser, baseURL);
  await openDemo(page);
  await signIn(page, newUser());
  await saved(page);

  await accountButton(page).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
  await expect(syncStatus(page)).toHaveCount(0);
  await expect(page.getByTestId("course-row-ENGL393")).toBeVisible();

  await openScheduler(page);
  await expect(planTabs(page)).toHaveText(["Plan A", "Plan B"]);
  await expect(page.getByTestId("course-row-ENGL393")).toBeVisible();
});

test("signing out and removing clears this device, and the account keeps everything", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const page = await device(browser, baseURL);
  await openDemo(page);
  await signIn(page, user);
  await saved(page);
  await removeCourse(page, "ENGL393");

  await accountButton(page).click();
  await page
    .getByRole("menuitem", {
      name: "Sign out and remove plans from this device",
    })
    .click();
  // Saved first, then cleared: the front page, as for a first visit.
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() => localStorage.getItem("terpsicle:returning")),
  ).toBeNull();
  await openScheduler(page);
  await expect(page.getByTestId("first-visit")).toBeVisible();
  await expect(planTabs(page)).toHaveText(["Plan A"]);

  // Nothing was lost: the account has the change made just before.
  const other = await device(browser, baseURL);
  await signIn(other, user);
  await expect(planTabs(other)).toHaveText(["Plan A", "Plan B"]);
  await expect(other.getByTestId("course-row-CMSC351")).toBeVisible();
  await expect(other.getByTestId("course-row-ENGL393")).toHaveCount(0);
});
