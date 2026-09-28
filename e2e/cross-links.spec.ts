import { expect, type Page, test } from "@playwright/test";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";
import { lowerPlanDrawer } from "./plan-drawer";

// The "View …" links between products (docs/V3.md §1.2) on `pnpm dev:mock`,
// followed to where they lead: Plan → Reviews and Todo, and Todo → Chat and
// Schedule. Todo signs in as a throwaway person (`e2e…`), so parallel runs
// never share a feed.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("Plan links a course to its reviews, and the semester in progress to Todo", async ({
  page,
  isMobile,
}) => {
  // In Fall 2026.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: "Fall 2026" })
      .click();
  const fall = page.getByRole("region", { name: "Fall 2026", exact: true });
  await fall.getByRole("button", { name: "Add a course to Fall 2026" }).click();
  await page.getByRole("searchbox", { name: "Search courses" }).fill("CMSC351");
  await page
    .getByRole("button", { name: "Add CMSC351 to Fall 2026", exact: true })
    .click();

  // On a phone, Search left the drawer up over the semesters.
  if (isMobile) await lowerPlanDrawer(page);
  await fall.getByRole("button", { name: "CMSC351 options" }).click();
  await page.getByRole("menuitem", { name: "View reviews" }).click();
  await expect(page).toHaveURL(/\/reviews\/courses\/CMSC351$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /CMSC351/ }),
  ).toBeVisible();

  await page.goBack();
  await fall.getByRole("link", { name: "View todos" }).click();
  await expect(page).toHaveURL(/\/todo$/);
  // Todo's front door says what it does before signing in.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your deadlines, on a calendar",
    }),
  ).toBeVisible();
});

/** Test sign-in as a new throwaway person, then Todo. */
async function signIn(page: Page) {
  await page.goto("/todo");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/todo" }),
    });
    const result: { return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  expect(next).toContain("/todo");
  await page.goto("/todo");
}

test("Todo links a course to its chat, and the week to its schedule", async ({
  page,
  isMobile,
}) => {
  await signIn(page);
  // On a phone the side panel's ELMS part is folded above the calendar.
  if (isMobile)
    await page.getByRole("button", { name: /^Courses and ELMS/ }).click();
  await page
    .getByLabel("ELMS calendar link")
    .fill(testFeedLink(TEST_FEED_TOKENS.calendar));
  await page.getByRole("button", { name: "Connect ELMS" }).click();
  await expect(page.getByText(/^6 open · ELMS feed checked/)).toBeVisible();

  // The week's header links to its classes.
  await page.getByRole("link", { name: "View schedule" }).click();
  await expect(page).toHaveURL(/\/schedule\//);
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();

  // Each course in the side panel links to its chat room.
  await page.goBack();
  await expect(page.getByText(/^6 open · ELMS feed checked/)).toBeVisible();
  if (isMobile)
    await page.getByRole("button", { name: /^Courses and ELMS/ }).click();
  await page.getByRole("link", { name: "View chat for CMSC216" }).click();
  await expect(page).toHaveURL(/\/chat\?term=\d{6}&course=CMSC216$/);
});
