import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

// Four-year plans sync like the scheduler's plans (docs/V3.md §2.4): the real
// /api/sync routes over the dev server's local D1, and two browser contexts
// signed in as the same person in test mode, as two devices would be. Each
// test signs in as its own throwaway person (`e2e…`), as e2e/sync.spec.ts does.

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
  // In Fall 2026, as e2e/plan.spec.ts has it.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
  return page;
}

function newUser(): string {
  return `e2e${Math.random().toString(36).slice(2, 12)}`;
}

/** Plan's saved-state line: the account's status words while signed in. */
const savedState = (page: Page) =>
  page.getByRole("banner").locator("[data-sync-status]");
const spring = (page: Page) =>
  page.getByRole("region", { name: "Spring 2027", exact: true });

async function openPlan(page: Page) {
  await page.goto("/plan");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Test sign-in, as /auth/test's button does it, then back to Plan. */
async function signIn(page: Page, userId: string) {
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/plan" }),
    });
    const result: { status: string; return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  expect(next).toContain("/plan");
  await page.goto(next);
}

async function saved(page: Page) {
  await expect(savedState(page)).toHaveAttribute("data-sync-status", "saved");
  await expect(savedState(page)).toHaveText("Saved");
}

/** Pressing the saved-state line checks with the account now. */
async function pull(page: Page) {
  await savedState(page).click();
  await saved(page);
}

/** A plan with CMSC351, signed in as `user`, saved to the account. */
async function signedInWithPlan(page: Page, user: string) {
  await openPlan(page);
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  await addCourse(page, "CMSC351");
  await signIn(page, user);
  await saved(page);
}

async function addCourse(page: Page, code: string) {
  await spring(page)
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await search.fill(code);
  await page
    .getByRole("button", { name: `Add ${code} to Spring 2027`, exact: true })
    .click();
  await expect(spring(page).getByText(code)).toBeVisible();
}

test("a four-year plan goes up at sign-in, and two devices see each other's edits", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();

  // A laptop plans while signed out: saved in this browser.
  const laptop = await device(browser, baseURL);
  await openPlan(laptop);
  await laptop.getByLabel("I started at UMD in").click();
  await laptop.getByRole("option", { name: "Fall 2025" }).click();
  await laptop.getByRole("button", { name: "or add courses yourself" }).click();
  await addCourse(laptop, "CMSC351");
  await expect(laptop.getByText("Saved in this browser")).toBeVisible();

  // Signing in takes it to the account, and the line says so.
  await signIn(laptop, user);
  await expect(
    laptop.getByText("Your four-year plan is saved to your account"),
  ).toBeVisible();
  await saved(laptop);
  await expect(laptop.getByText("Saved in this browser")).toHaveCount(0);

  // A second device signs in and gets it, course and all.
  const phone = await device(browser, baseURL);
  await openPlan(phone);
  await signIn(phone, user);
  await expect(
    phone.getByText("Your account's four-year plan is here"),
  ).toBeVisible();
  await saved(phone);
  await expect(phone.getByRole("button", { name: /^My plan/ })).toBeVisible();
  await expect(spring(phone).getByText("CMSC351")).toBeVisible();

  // An edit there reaches the laptop.
  await addCourse(phone, "MATH240");
  await saved(phone);
  await pull(laptop);
  await expect(spring(laptop).getByText("MATH240")).toBeVisible();

  // And one from the laptop reaches the phone: a rename.
  await laptop.getByRole("button", { name: /^My plan/ }).click();
  await laptop.getByRole("menuitem", { name: "Rename" }).click();
  const name = laptop.getByRole("textbox", { name: "Four-year plan name" });
  await name.fill("CS major");
  await name.press("Enter");
  await saved(laptop);
  await pull(phone);
  await expect(phone.getByRole("button", { name: /^CS major/ })).toBeVisible();
  // The account's version replaced the doc, so undo can't bring back the
  // phone's older one (the scheduler's rule for plans).
  await expect(phone.getByLabel("Undo", { exact: true })).toBeDisabled();
});

test("a second device opens the account's four-year plan, and keeps its own as a copy", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const laptop = await device(browser, baseURL);
  await signedInWithPlan(laptop, user);

  // The phone made its own "My plan" before signing in.
  const phone = await device(browser, baseURL);
  await openPlan(phone);
  await phone.getByLabel("I started at UMD in").click();
  await phone.getByRole("option", { name: "Fall 2025" }).click();
  await phone.getByRole("button", { name: "or add courses yourself" }).click();
  await addCourse(phone, "MATH240");
  await signIn(phone, user);

  // QA P4: it opened "My plan (copy)", and the toast told two stories.
  await expect(
    phone.getByText("My plan from this device is saved as My plan (copy)"),
  ).toBeVisible();
  await expect(
    phone.getByText(
      "Your account already had one by that name. My plan from your account is open.",
    ),
  ).toBeVisible();
  await saved(phone);
  // The bar names the open plan: the account's, not the copy.
  await expect(phone.getByRole("button", { name: /^My plan/ })).toBeVisible();
  await expect(phone.getByRole("button", { name: /\(copy\)/ })).toHaveCount(0);
  await expect(spring(phone).getByText("CMSC351")).toBeVisible();
  await expect(spring(phone).getByText("MATH240")).toHaveCount(0);
});

test("the same four-year plan changed on two devices, one offline, keeps both", {
  tag: "@critical",
}, async ({ browser, baseURL }) => {
  const user = newUser();
  const a = await device(browser, baseURL);
  await signedInWithPlan(a, user);
  const b = await device(browser, baseURL);
  await openPlan(b);
  await signIn(b, user);
  await saved(b);
  await expect(spring(b).getByText("CMSC351")).toBeVisible();

  // Search is a route with its own chunk. In production the service worker
  // has every route's chunk before this (scripts/pwa-precache.ts); the dev
  // server runs no worker, so open Search once while online, as the worker
  // would have fetched it.
  const rail = b.getByRole("navigation", { name: "Plan views" });
  await rail.getByRole("button", { name: "Search" }).click();
  await expect(
    b.getByRole("searchbox", { name: "Search courses" }),
  ).toBeVisible();
  await rail.getByRole("button", { name: "GenEd" }).click();

  await b.context().setOffline(true);
  await addCourse(b, "MATH240");
  await expect(savedState(b)).toHaveAttribute("data-sync-status", "offline");
  await expect(savedState(b)).toHaveText("Saves when online");

  await addCourse(a, "STAT400");
  await saved(a);

  await b.context().setOffline(false);
  await expect(
    b.getByText("Your changes are kept as My plan (copy)"),
  ).toBeVisible();
  await saved(b);
  // The plan itself is the other device's version; the copy is this one's.
  await expect(spring(b).getByText("STAT400")).toBeVisible();
  await expect(spring(b).getByText("MATH240")).toHaveCount(0);
  await b.getByRole("button", { name: /^My plan/ }).click();
  await b.getByRole("menuitemradio", { name: "My plan (copy)" }).click();
  await expect(spring(b).getByText("MATH240")).toBeVisible();

  await pull(a);
  await a.getByRole("button", { name: /^My plan/ }).click();
  await expect(
    a.getByRole("menuitemradio", { name: "My plan (copy)" }),
  ).toBeVisible();
});

test("signing out and removing plans clears four-year plans too, and the account keeps them", async ({
  browser,
  baseURL,
}) => {
  const user = newUser();
  const page = await device(browser, baseURL);
  await signedInWithPlan(page, user);

  // Signing out lives in the scheduler's account menu.
  await page.goto("/schedule");
  await page
    .getByRole("banner")
    .getByRole("button", { name: `Account: E2E ${user.slice(3)}` })
    .click();
  await page
    .getByRole("menuitem", {
      name: "Sign out and remove plans from this device",
    })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await openPlan(page);
  await expect(
    page.getByRole("heading", { name: "Plan your four years" }),
  ).toBeVisible();

  const other = await device(browser, baseURL);
  await openPlan(other);
  await signIn(other, user);
  await saved(other);
  await expect(spring(other).getByText("CMSC351")).toBeVisible();
});
