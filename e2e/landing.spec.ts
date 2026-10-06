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
  page.getByRole("heading", {
    name: "Plan the semester in five steps, in one place.",
    level: 1,
  });
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
 * Flags, across navigations in this tab, any moment the marketing page was
 * on screen. The check hides the page until it decides, so a redirect
 * must never set it.
 */
function watchForMarketing(): void {
  const check = () => {
    const shown =
      !document.documentElement.hasAttribute("data-landing") &&
      document.querySelector("[data-marketing]") !== null;
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
  await expect(page).toHaveTitle(
    "Terpsicle: the UMD class scheduler, with reviews, chats and more",
  );
  // Still shown once the app has hydrated: the check never runs twice.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-landing");
  await expect(marketingHeading(page)).toBeVisible();

  // The hero's button (the closing section repeats it).
  await page.getByRole("link", { name: "View schedule" }).first().click();
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

test("the bar names every product, and narrower, the menu does", async ({
  page,
  isMobile,
}) => {
  await page.goto("/schedule");
  const tabs = page.getByRole("navigation", { name: "Products" });
  if (isMobile) {
    // A phone's tab bar names them, Home first, where you are current.
    await expect(tabs).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Tab bar" });
    for (const name of ["Home", "Schedule", "Reviews", "Chat", "Todo"])
      await expect(bar.getByRole("link", { name })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await bar.getByRole("link", { name: "Reviews" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Terpsicle Reviews",
        level: 1,
      }),
    ).toBeVisible();
    return;
  } else {
    for (const name of ["Schedule", "Reviews", "Chat"])
      await expect(tabs.getByRole("link", { name })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Schedule" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Below 1100px the tabs fold into the product menu, which names where
    // you are.
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(tabs).toBeHidden();
    await page
      .getByRole("button", { name: /Schedule/ })
      .first()
      .click();
  }
  const menu = page.getByRole("menu");
  for (const name of [/^Schedule/, /^Reviews/, /^Chat/, /^About Terpsicle/])
    await expect(menu.getByRole("menuitem", { name })).toBeVisible();
  await menu.getByRole("menuitem", { name: /^Reviews/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Terpsicle Reviews",
      level: 1,
    }),
  ).toBeVisible();
});

for (const [path, heading, title] of [
  [
    "/reviews",
    "Terpsicle Reviews",
    "UMD course and instructor reviews · Terpsicle",
  ],
  ["/chat", "A chat room for every class", "Chat · Terpsicle"],
  ["/privacy", "Privacy", "Privacy · Terpsicle"],
  ["/terms", "Terms of use", "Terms of use · Terpsicle"],
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

// Admins only (V2 §10): a signed-out visit goes to sign in first. The
// admin's own page (outside the scheduler) and everyone else's 404 are in
// e2e/admin.spec.ts.
test("/admin sends a signed-out visitor to sign in, and back afterwards", async ({
  page,
}) => {
  const response = await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin\?return=%2Fadmin$/);
  expect(
    (await response?.request().redirectedFrom()?.response())?.status(),
  ).toBe(302);
  await expect(
    page.getByRole("heading", { name: "Sign in", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("[data-app-shell]")).toHaveCount(0);
});

test("/privacy and /terms show the contact address in words, never whole", async ({
  page,
  request,
}) => {
  const address = ["admin", "terpsicle.com"].join("@");
  for (const path of ["/privacy", "/terms"]) {
    const html = await (await request.get(path)).text();
    expect(html).toContain("admin [at] terpsicle.com");
    expect(html).not.toContain(address);
  }

  await page.goto("/privacy");
  await expect(
    page.getByText(
      "We don't sell or share your data, and analytics are anonymous.",
    ),
  ).toBeVisible();
  // "Email us" builds the mailto: only on click, so the hydrated page
  // doesn't hold the address either.
  await expect(page.getByRole("button", { name: "Email us" })).toBeVisible();
  expect(await page.content()).not.toContain(address);
});

// The terms sit beside the privacy page wherever it's linked: every
// reading page's footer, and the line under sign-in.
test("/terms is a footer link away from /privacy, and sign-in names both", async ({
  page,
}) => {
  await page.goto("/privacy");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Terms of use" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(
    page.getByRole("heading", { name: "Terms of use", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The legal part", level: 2 }),
  ).toBeVisible();
  await footer.getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", { name: "Privacy", level: 1 }),
  ).toBeVisible();

  await page.goto("/signin");
  const agreement = page.getByText("By signing in, you agree to the");
  await expect(agreement).toHaveText(
    "By signing in, you agree to the terms of use and privacy policy.",
  );
  await expect(
    agreement.getByRole("link", { name: "terms of use" }),
  ).toHaveAttribute("href", "/terms");
  await expect(
    agreement.getByRole("link", { name: "privacy policy" }),
  ).toHaveAttribute("href", "/privacy");
});

test("an unknown path says so and offers the scheduler", async ({
  page,
  isMobile,
}) => {
  const response = await page.goto("/schedule/nowhere");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
  // A broken link is what people report: the bar keeps Feedback and Support
  // (in the account menu on a phone).
  if (!isMobile) {
    const bar = page.getByRole("banner");
    await expect(bar.getByTestId("feedback-button")).toBeVisible();
    await expect(
      bar.getByRole("button", { name: "Support Terpsicle" }),
    ).toBeVisible();
  }
  await page.getByRole("link", { name: "View schedule" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
});
