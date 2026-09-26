import { expect, type Page, test } from "@playwright/test";

// `/` and the pages around the scheduler (docs/V2.md §1–§2): first visits
// see the marketing page; anyone with a saved plan or a session goes straight
// to /schedule without the marketing page showing first; `/?stay` always
// shows it.

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
/** The scheduler's calendar: on screen on desktop and phones alike. */
const scheduler = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

/** Resolves once the scheduler has saved its first plan and set the flag. */
async function returning(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("terpsicle:returning")),
    )
    .toBe("1");
}

/**
 * Flags, across navigations in this tab, any moment the marketing heading
 * was on screen. The check hides the page until it decides, so a redirect
 * must never set it.
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

async function sawMarketing(page: Page): Promise<boolean> {
  return page.evaluate(() => sessionStorage.getItem("saw-marketing") === "1");
}

test("a first visit sees the marketing page; after that, / opens the scheduler", async ({
  page,
}) => {
  await page.goto("/");
  await expect(marketingHeading(page)).toBeVisible();
  await expect(page).toHaveTitle("Terpsicle");
  // Still shown once the app has hydrated: the check never runs twice.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-landing");
  await expect(marketingHeading(page)).toBeVisible();

  await page.getByRole("link", { name: "Open the scheduler" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(scheduler(page)).toBeVisible();
  // The scheduler saved a plan and set the returning flag.
  await returning(page);

  await page.addInitScript(watchForMarketing);
  await page.goto("/?utm_source=flyer");
  await expect(page).toHaveURL(/\/schedule\?utm_source=flyer$/);
  await expect(scheduler(page)).toBeVisible();
  expect(await sawMarketing(page)).toBe(false);
});

test("without the returning flag, saved plans still skip the marketing page", async ({
  page,
}) => {
  await page.goto("/schedule");
  await returning(page);
  await page.evaluate(() => localStorage.removeItem("terpsicle:returning"));

  await page.addInitScript(watchForMarketing);
  await page.goto("/");
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(scheduler(page)).toBeVisible();
  expect(await sawMarketing(page)).toBe(false);
  // Counting plans put the flag back for next time.
  expect(
    await page.evaluate(() => localStorage.getItem("terpsicle:returning")),
  ).toBe("1");
});

/**
 * Sends a session cookie with every request. `__Host-` cookies need HTTPS
 * to be stored, and the dev server is plain HTTP; the Worker only checks
 * that the header carries one.
 */
async function signIn(page: Page): Promise<void> {
  await page.context().setExtraHTTPHeaders({ Cookie: "__Host-session=e2e" });
}

test("a session cookie goes straight to the scheduler", async ({ page }) => {
  await signIn(page);
  const response = await page.goto("/");
  expect(response?.url()).toMatch(/\/schedule$/);
  await expect(scheduler(page)).toBeVisible();
});

test("/?stay shows the marketing page, even to someone returning", async ({
  page,
}) => {
  await page.goto("/schedule");
  await returning(page);
  await signIn(page);
  await page.goto("/?stay");
  await expect(marketingHeading(page)).toBeVisible();
  await expect(page).toHaveURL(/\/\?stay$/);
});

test("the logo opens the product menu", async ({ page }) => {
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Terpsicle" }).click();
  const menu = page.getByRole("menu");
  for (const name of [/^Schedule/, /^Reviews/, /^Chat/, /^About Terpsicle/])
    await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Reviews/ }).click();
  await expect(
    page.getByRole("heading", { name: "Terpsicle Reviews", level: 1 }),
  ).toBeVisible();
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

test("/privacy shows the contact address in words, never whole", async ({
  page,
  request,
}) => {
  const address = ["admin", "terpsicle.com"].join("@");
  const html = await (await request.get("/privacy")).text();
  expect(html).toContain("admin [at] terpsicle.com");
  expect(html).not.toContain(address);

  await page.goto("/privacy");
  await expect(
    page.getByText("We don't sell or share your data."),
  ).toBeVisible();
  // "Email us" builds the mailto: only on click, so the hydrated page
  // doesn't hold the address either.
  await expect(page.getByRole("button", { name: "Email us" })).toBeVisible();
  expect(await page.content()).not.toContain(address);
});

test("an unknown path says so and offers the scheduler", async ({ page }) => {
  const response = await page.goto("/schedule/nowhere");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open the scheduler" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
});
