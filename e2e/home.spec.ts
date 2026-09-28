import { expect, type Page, test } from "@playwright/test";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";

// Home (docs/V3.md §1.5), the installed app's start page, on `pnpm
// dev:mock`: today's classes from the term in session's main plan with the
// walk between buildings, the term you're registering for with its
// problems, the sign-in prompt signed out, and signed in, "Due soon" checked
// off with Undo. Hidden: nothing in the bar links here.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const section = (page: Page, name: string) =>
  page.locator("section").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });

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

test("signed out in the fall: Spring 2027's plan and problems, and what signing in adds", async ({
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
  await expect(next).toContainText("Next");
  await expect(next).toContainText(/\d+ problems?|No problems/);
  await expect(section(page, "Sign in for more")).toBeVisible();

  // Hidden: no product tab is selected, and nothing in the bar is Home.
  const bar = page.locator("[data-slot=app-bar]");
  await expect(bar.locator("[aria-current=page]")).toHaveCount(0);
  await expect(bar.locator('a[href="/home"]')).toHaveCount(0);

  await next.getByRole("link", { name: /^Plan A/ }).click();
  await expect(page).toHaveURL(/\/schedule\/problems\?/);
});

test("in the term: what's left of today, with the walk between buildings", async ({
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
  // Next is Fall 2027, which the demo has no plan for.
  await expect(section(page, "Fall 2027 Next")).toContainText(
    "No plan for Fall 2027 yet.",
  );
});

test("signed in: check off something due soon, then Undo", async ({ page }) => {
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

  const due = section(page, "Due soon");
  const first = due.getByTestId("todo-item").first();
  await expect(first).toBeVisible();
  const box = first.getByRole("checkbox");
  await box.check();
  await expect(box).toBeChecked();
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toContainText("done");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(box).not.toBeChecked();
  // Chat's part is there too, signed in.
  await expect(section(page, "Chat")).toBeVisible();
  await expect(section(page, "Sign in for more")).toHaveCount(0);
});
