import { expect, type Page, test } from "@playwright/test";

// Plan ↔ Schedule (docs/V3.md §2.12) on `pnpm dev:mock`: a four-year plan's
// next semester makes a scheduler plan with its courses bookmarked, the
// scheduler's Courses tab names the placeholder and links back, Plan counts
// what's placed, and a second "View schedule" opens the same plan without
// changing it. On desktop and a phone; nothing signs in.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // In Fall 2026, so Spring 2027 (the mock catalog's term) is next.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * Spring 2027's column; on a phone, picked from the strip first, lowering
 * the drawer if Search left it all the way up over the semesters.
 */
async function spring(page: Page, isMobile: boolean) {
  if (isMobile) {
    const lower = page.getByRole("button", { name: "Lower the panel" });
    if (await lower.isVisible()) await lower.click();
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: "Sp 2027" })
      .click();
  }
  return page.getByRole("region", { name: "Spring 2027", exact: true });
}

async function add(page: Page, isMobile: boolean, query: string, name: string) {
  const column = await spring(page, isMobile);
  await column
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await expect(search).toBeFocused();
  await search.fill(query);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(column.getByText(query.toUpperCase())).toBeVisible();
}

test("View schedule makes Spring's plan, View plan comes back, and the second trip opens the same plan", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").selectOption("202508");
  await page.getByRole("button", { name: "Start planning" }).click();
  await add(page, isMobile, "CMSC351", "Add CMSC351 to Spring 2027");
  await add(page, isMobile, "STAT400", "Add STAT400 to Spring 2027");
  await add(page, isMobile, "cmsc4xx", "Add CMSC4XX to Spring 2027");

  // Only the next semester hands off.
  const column = await spring(page, isMobile);
  const view = column.getByRole("link", { name: "View schedule" });
  await expect(view).toBeVisible();
  await view.click();

  await expect(page).toHaveURL(/\/schedule\/courses\?/);
  await expect(page).toHaveURL((url) => !url.searchParams.has("from"));
  await expect(
    page.getByText(
      "Plan A has your 2 courses from your four-year plan. Pick sections for each.",
    ),
  ).toBeVisible();
  const saved = page.getByRole("list", { name: "Bookmarked" });
  await expect(saved.getByRole("button", { name: /^CMSC351/ })).toBeVisible();
  await expect(saved.getByRole("button", { name: /^STAT400/ })).toBeVisible();
  const line = page.getByTestId("four-year-line");
  await expect(line).toContainText(
    "CMSC4XX is a placeholder; pick a course in Search or Generate.",
  );
  await expect(line).not.toContainText("aren't here");

  // A phone's drawer opens far enough to show the bookmarks.
  if (isMobile)
    await expect(page.locator("[data-vaul-drawer]")).not.toHaveAttribute(
      "data-snap",
      "peek",
    );

  // Back to Plan, on Spring 2027: nothing placed yet.
  await line.getByRole("link", { name: "View plan" }).click();
  await expect(page).toHaveURL(/\/plan\?semester=202701/);
  const back = page.getByRole("region", { name: "Spring 2027", exact: true });
  await expect(back.getByText("From Plan A: 0 of 2 placed")).toBeVisible();

  // Again: the same plan, as it is.
  await back.getByRole("link", { name: "View schedule" }).click();
  await expect(page).toHaveURL(/\/schedule\/courses\?/);
  await expect(page).toHaveURL((url) => !url.searchParams.has("from"));
  await expect(saved.getByRole("listitem")).toHaveText([
    /^CMSC351/,
    /^STAT400/,
  ]);
  await expect(page.getByRole("heading", { name: "Plan A" })).toBeVisible();
  await expect.poll(() => springPlanCount(page)).toBe(1);
});

/** How many scheduler plans this browser has for Spring 2027. */
function springPlanCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("terpsicle");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result
            .transaction("plans")
            .objectStore("plans")
            .index("termId")
            .count("202701");
          request.onsuccess = () => {
            resolve(request.result);
            open.result.close();
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

test("a second visit in the same page fills the empty plan an earlier visit made, and it's saved", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").selectOption("202508");
  await page.getByRole("button", { name: "Start planning" }).click();
  await add(page, isMobile, "CMSC351", "Add CMSC351 to Spring 2027");
  await add(page, isMobile, "STAT400", "Add STAT400 to Spring 2027");

  // A look at the scheduler first: its first visit makes an empty Plan A,
  // and the Courses tab names what the four-year plan has.
  await page.goto("/schedule/courses?term=202701");
  const line = page.getByTestId("four-year-line");
  await expect(line).toContainText(
    "From your four-year plan: CMSC351 and STAT400 aren't here.",
  );
  await expect.poll(() => springPlanCount(page)).toBe(1);

  // To Plan and back without a reload: the scheduler mounts again.
  await line.getByRole("link", { name: "View plan" }).click();
  await expect(page).toHaveURL(/\/plan\?semester=202701/);
  await page
    .getByRole("region", { name: "Spring 2027", exact: true })
    .getByRole("link", { name: "View schedule" })
    .click();
  await expect(
    page.getByText(
      "Plan A has your 2 courses from your four-year plan. Pick sections for each.",
    ),
  ).toBeVisible();

  // Saved, not just shown.
  await page.reload();
  const saved = page.getByRole("list", { name: "Bookmarked" });
  await expect(saved.getByRole("listitem")).toHaveText([
    /^CMSC351/,
    /^STAT400/,
  ]);
  await expect.poll(() => springPlanCount(page)).toBe(1);
});
