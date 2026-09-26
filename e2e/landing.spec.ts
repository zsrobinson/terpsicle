import { expect, type Page, test } from "@playwright/test";

// `/` and the pages around the scheduler (the owner's v2 decisions): first
// visits see the marketing page; anyone with saved plans or a session goes
// straight to /schedule, without the marketing page showing first.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const marketingHeading = (page: Page) =>
  page.getByRole("heading", { name: "Terpsicle", level: 1 });

/** Plans in the app's database that hold a course. */
function plansWithCourses(): Promise<number> {
  return new Promise((resolve) => {
    const request = indexedDB.open("terpsicle");
    request.onerror = () => resolve(0);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("plans")) {
        db.close();
        resolve(0);
        return;
      }
      const all = db.transaction("plans").objectStore("plans").getAll();
      all.onsuccess = () => {
        db.close();
        resolve(
          (all.result as { courses: unknown[] }[]).filter(
            (p) => p.courses.length > 0,
          ).length,
        );
      };
    };
  });
}

/**
 * Flags, across navigations in this tab, any moment the marketing heading
 * was on screen. The landing check hides the page until it decides, so a
 * redirect must never set it.
 */
function watchForMarketing(): void {
  const check = () => {
    const shown =
      !document.documentElement.hasAttribute("data-landing") &&
      [...document.querySelectorAll("h1")].some(
        (h) => h.textContent === "Terpsicle",
      );
    if (shown) sessionStorage.setItem("saw-marketing", "1");
  };
  new MutationObserver(check).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}

test("a first visit shows the marketing page, which opens the scheduler", async ({
  page,
}) => {
  await page.goto("/");
  await expect(marketingHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page).toHaveTitle("Terpsicle");

  await page.getByRole("link", { name: "Open Terpsicle" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByTestId("first-visit")).toBeVisible();

  // Opening the scheduler saves an empty plan: that isn't saved work yet.
  await page.goto("/");
  await expect(marketingHeading(page)).toBeVisible();
});

test("after adding a course, / goes straight to the scheduler", async ({
  page,
}) => {
  await page.goto("/schedule?term=202701&course=CMSC351");
  await page.getByRole("button", { name: "Add to Plan A" }).click();
  await expect.poll(() => page.evaluate(plansWithCourses)).toBe(1);

  await page.addInitScript(watchForMarketing);
  await page.goto("/");
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("saw-marketing")),
  ).toBeNull();
});

test("a session cookie goes straight to the scheduler", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: "session", value: "e2e", url: baseURL ?? "" },
  ]);
  const response = await page.goto("/");
  expect(response?.url()).toMatch(/\/schedule$/);
  await expect(page.getByTestId("first-visit")).toBeVisible();
});

for (const [path, heading, title] of [
  ["/reviews", "Terpsicle Reviews", "Reviews · Terpsicle"],
  ["/chat", "Terpsicle Chat", "Chat · Terpsicle"],
  ["/settings", "Settings", "Settings · Terpsicle"],
  ["/admin", "Admin", "Admin · Terpsicle"],
  ["/privacy", "Privacy", "Privacy · Terpsicle"],
] as const) {
  test(`${path} is its own page, outside the scheduler`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle(title);
    await expect(page.locator("[data-app-shell]")).toHaveCount(0);
  });
}

test("an unknown path says so and offers the scheduler", async ({ page }) => {
  const response = await page.goto("/schedule/nowhere");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open Terpsicle" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
});
