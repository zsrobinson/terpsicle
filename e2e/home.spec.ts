import { expect, type Page, test } from "@playwright/test";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";
import { liveToasts } from "./toasts";

// Home (docs/V3.md §1.5) on `pnpm dev:mock`: Now in the wide column and
// Next in the narrow one on a desktop, one column on a phone; the bar's
// wordmark going Home; today's classes with the next one marked and the
// walk between buildings; the term you register for with its problems;
// setup callouts, closed and staying closed; and signed in, this week's
// deadlines by class, checked off with Undo.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const section = (page: Page, name: string | RegExp) =>
  page.locator("section").filter({
    has: page.getByRole("heading", {
      name,
      exact: typeof name === "string",
    }),
  });

const callout = (page: Page, id: string) =>
  page.locator(`[data-home-callout="${id}"]`);

const column = (page: Page, which: "now" | "next") =>
  page.locator(`[data-home-column="${which}"]`);

/** The demo's plans (Spring 2027, the mock catalog's term) on this device. */
async function withDemoPlans(page: Page) {
  await page.goto("/schedule/courses?demo=1");
  await expect(
    page.getByRole("navigation", { name: "Plans" }).getByRole("button", {
      name: "Plan A",
      exact: true,
    }),
  ).toBeVisible();
  // Saved to IndexedDB, which Home reads.
  await page.waitForTimeout(1000);
}

test("signed out in the fall: Spring 2027's plan and problems, and a sign-in callout", async ({
  page,
}) => {
  // In Fall 2026, so Spring 2027 is Next and nothing of the demo's is Now.
  await page.clock.setFixedTime(new Date("2026-09-28T13:00:00Z"));
  await withDemoPlans(page);
  await page.goto("/home");

  await expect(page).toHaveTitle("Home · Terpsicle");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Good morning" }),
  ).toBeVisible();
  await expect(section(page, "Today")).toContainText(
    "No schedule for Fall 2026 on this device.",
  );
  const next = section(page, "Spring 2027 Next");
  await expect(next).toContainText("Plan A");
  await expect(next).toContainText(/\d+ courses · \d+ credits/);
  await expect(next).toContainText(/\d+ problems?|No problems/);
  // Todo and Chat need an account: one callout says what signing in adds.
  await expect(callout(page, "sign-in")).toContainText("Sign in for more");
  await expect(
    callout(page, "sign-in").getByRole("link", { name: /^Sign in/ }),
  ).toBeVisible();
  // Nothing of the account's shows signed out.
  await expect(section(page, /^This week/)).toHaveCount(0);

  // No product tab is selected on Home.
  const bar = page.locator("[data-slot=app-bar]");
  await expect(bar.locator("nav [aria-current=page]")).toHaveCount(0);

  await next.getByRole("link", { name: /^Plan A/ }).click();
  await expect(page).toHaveURL(/\/schedule\/problems\?/);
});

test("in the term: today's classes, the next one marked, with the walk between buildings", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same page; one width is enough");
  // Monday Feb 1, 2027, 9am in College Park: Spring 2027 is Now.
  await page.clock.setFixedTime(new Date("2027-02-01T14:00:00Z"));
  await withDemoPlans(page);
  await page.goto("/home");

  const classes = section(page, "Today").getByRole("list", {
    name: "Today's classes",
  });
  await expect(classes.getByRole("listitem").first()).toBeVisible();
  await expect(classes).toContainText("CMSC351");
  await expect(classes).toContainText(/min walk from [A-Z]+/);
  // Nothing's under way at 9am: the first class is next.
  await expect(classes.locator('[data-class-status="next"]')).toHaveCount(1);
  await expect(classes.locator('[data-class-status="next"]')).toContainText(
    /Next/,
  );
  // The status line says which week of the term it is, when it's known.
  await expect(page.locator("[data-slot=page-header]")).toContainText(
    "Monday, Feb 1",
  );
  // Next is Fall 2027, which the demo has no plan for: a callout, not a section.
  await expect(section(page, "Fall 2027 Next")).toHaveCount(0);
  await expect(callout(page, "next-term")).toContainText(
    "Build your Fall 2027 schedule",
  );
});

test("desktop: Now takes two thirds, Next the last third", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the phone's layout is its own test");
  await page.clock.setFixedTime(new Date("2026-09-28T13:00:00Z"));
  await withDemoPlans(page);
  await page.goto("/home");
  await expect(section(page, "Spring 2027 Next")).toBeVisible();

  const now = await column(page, "now").boundingBox();
  const next = await column(page, "next").boundingBox();
  if (!now || !next) throw new Error("expected both columns");
  // Side by side, tops aligned, Now about twice as wide.
  expect(next.x).toBeGreaterThan(now.x + now.width);
  expect(Math.abs(next.y - now.y)).toBeLessThan(2);
  expect(now.width / next.width).toBeGreaterThan(1.8);
  expect(now.width / next.width).toBeLessThan(2.6);
});

test("phone: one column, Now first, then Next", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the desktop's layout is its own test");
  await page.clock.setFixedTime(new Date("2026-09-28T13:00:00Z"));
  await withDemoPlans(page);
  await page.goto("/home");
  await expect(section(page, "Spring 2027 Next")).toBeVisible();

  const now = await column(page, "now").boundingBox();
  const next = await column(page, "next").boundingBox();
  if (!now || !next) throw new Error("expected both columns");
  expect(Math.round(next.x)).toBe(Math.round(now.x));
  expect(Math.round(next.width)).toBe(Math.round(now.width));
  expect(next.y).toBeGreaterThanOrEqual(now.y + now.height);
  // No sideways scroll.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the wordmark goes Home, from any product", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones reach Home from the tab bar");
  for (const path of ["/reviews", "/todo"]) {
    await page.goto(path);
    const bar = page.locator("[data-slot=app-bar]");
    // Hydrated: the account's answer is in, so the tooltip's handlers are live.
    await expect(bar.getByRole("button", { name: "Sign in" })).toBeVisible();
    const home = bar.locator('a[href="/home"]');
    await expect(home).toBeVisible();
    await home.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Home");
    await home.click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Good / }),
    ).toBeVisible();
  }
});

test("an empty device: callouts to set things up, closed and staying closed", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-28T13:00:00Z"));
  await page.goto("/home");

  // Two at most, the most useful first.
  await expect(callout(page, "sign-in")).toBeVisible();
  const plan = callout(page, "next-term");
  await expect(plan).toContainText("Build your Spring 2027 schedule");
  await expect(page.locator("[data-home-callout]")).toHaveCount(2);
  await expect(
    plan.getByRole("link", { name: "Start a plan" }),
  ).toHaveAttribute("href", /\/schedule\?term=202701/);

  await plan.getByRole("button", { name: /^Close/ }).click();
  await expect(plan).toHaveCount(0);
  await expect(liveToasts(page)).toContainText(
    "You won't see that on Home again",
  );
  // The next most useful one takes its place.
  await expect(callout(page, "plan")).toBeVisible();

  await page.reload();
  await expect(callout(page, "sign-in")).toBeVisible();
  await expect(callout(page, "plan")).toBeVisible();
  await expect(callout(page, "next-term")).toHaveCount(0);
});

test("signed in: this week by class, checked off with Undo", async ({
  page,
}) => {
  await page.goto("/home");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/home" }),
    });
    return ((await response.json()) as { return?: string }).return ?? "";
  }, userId);
  await page.goto(next);

  // Before ELMS: a callout where the week would be, once the account's
  // prefs say it wasn't closed on another device (ACCOUNT_PREFS_WAIT_MS at most).
  await expect(callout(page, "todo")).toContainText(
    "See this week's assignments here",
    { timeout: 10_000 },
  );
  await expect(
    callout(page, "todo").getByRole("link", { name: "Connect ELMS" }),
  ).toHaveAttribute("href", "/todo/connect");

  const connected = await page.evaluate(async (url) => {
    const response = await fetch("/api/todo/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return ((await response.json()) as { status: string }).status;
  }, testFeedLink(TEST_FEED_TOKENS.calendar));
  expect(connected).toBe("connected");
  await page.goto("/home");

  const week = section(page, /^This week/);
  await expect(callout(page, "todo")).toHaveCount(0);
  const first = week.locator("li[data-home-class]").first();
  await expect(first).toBeVisible();
  const key = await first.getAttribute("data-home-class");
  const row = week.locator(`li[data-home-class="${key}"]`);
  const meter = row.locator("[data-home-meter]");
  const before = (await meter.textContent()) ?? "";
  expect(before).toMatch(/^\d+ of \d+ done$/);

  // A click, not check(): the row moves on to the class's next deadline,
  // whose box is empty again.
  await row.getByRole("checkbox").click();
  await expect(meter).not.toHaveText(before);
  const toast = liveToasts(page);
  await expect(toast).toContainText("done");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(meter).toHaveText(before);

  // Signed in, plans sync: no "on this device" (the date is today's here).
  await expect(section(page, "Today")).toContainText(
    /No schedule for \w+ \d{4} yet\.|between semesters/,
  );
  await expect(callout(page, "sign-in")).toHaveCount(0);
});
