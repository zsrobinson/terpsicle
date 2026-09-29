import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// Navigations animate through the router's view transitions
// (docs/decisions.md, "Motion through view transitions"): a push going
// deeper, a pop coming back, a tab cross-fade between products and tabs,
// and none that move under Reduce Motion. `<html data-vt-type>` names the
// running one; the page records every type it shows. Search params that
// stay on one screen (typing) never animate.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as Window & { __vtTypes?: string[] }).__vtTypes = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        const type = (record.target as HTMLElement).dataset.vtType;
        if (type) seen.push(type);
      }
    }).observe(document, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-vt-type"],
    });
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Every transition type the page has shown, in order. */
const types = (page: Page) =>
  page.evaluate(
    () => (window as Window & { __vtTypes?: string[] }).__vtTypes ?? [],
  );
/** Waits for the next transition's type, and for it to finish. */
async function nextType(page: Page, before: number): Promise<string> {
  await expect.poll(async () => (await types(page)).length).toBe(before + 1);
  await expect(page.locator("html")).not.toHaveAttribute("data-vt-type");
  return (await types(page))[before] ?? "";
}

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    page.locator('[data-slot="app-bar"]').getByRole("button", {
      name: "Sign in",
    }),
  ).toBeVisible({ timeout: 20_000 });
}

const result = (page: Page, code: string) =>
  page.locator(`[data-course-result="${code}"]`).first();
const searchBox = (page: Page) =>
  page.getByRole("combobox", { name: "Search courses" });

async function openSearch(page: Page) {
  await page.goto("/schedule/search?demo=1&q=cmsc13");
  await expect(result(page, "CMSC131")).toBeVisible({ timeout: 20_000 });
}

test("a course pushes in from search, Back pops it, and typing doesn't move", async ({
  page,
}) => {
  await openSearch(page);
  const start = (await types(page)).length;

  await result(page, "CMSC131").click();
  await expect(page.locator(OPEN_VIEW)).toHaveText("CMSC131");
  expect(await nextType(page, start)).toBe("push");
  // The row and the header shared a name only while it ran.
  await expect(page.locator('[style*="view-transition-name"]')).toHaveCount(0);

  await page.goBack();
  await expect(page.locator(OPEN_VIEW)).toHaveCount(0);
  expect(await nextType(page, start + 1)).toBe("pop");

  await searchBox(page).fill("cmsc4");
  await expect(page).toHaveURL(/q=cmsc4/);
  await searchBox(page).fill("math");
  await expect(page).toHaveURL(/q=math/);
  expect(await types(page)).toHaveLength(start + 2);
});

test("another rail tab cross-fades", async ({ page, isMobile }) => {
  await openSearch(page);
  const start = (await types(page)).length;
  const tabs = isMobile
    ? page.locator("[data-workbench-drawer]").getByRole("navigation", {
        name: "Tabs",
      })
    : page.getByRole("navigation", { name: "Sidebar tabs" });
  await tabs.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(page).toHaveURL(/\/schedule\/courses/);
  expect(await nextType(page, start)).toBe("tab");
});

test("another product cross-fades", async ({ page, isMobile }) => {
  test.skip(isMobile, "the family bar's product links are the desktop's");
  await page.goto("/reviews");
  await hydrated(page);
  const start = (await types(page)).length;
  await page
    .getByRole("navigation", { name: "Products" })
    .getByRole("link", { name: "Plan" })
    .click();
  await expect(page).toHaveURL(/\/plan/);
  expect(await nextType(page, start)).toBe("tab");
});

test("the product menu and the drawer keep their own motion: no transition", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the phone's product menu and drawer");
  await openSearch(page);
  const start = (await types(page)).length;
  await page
    .locator('[data-slot="app-bar"]')
    .getByRole("button", { name: /^Terpsicle/ })
    .click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const drawer = page.locator("[data-workbench-drawer]");
  const snap = await drawer.getAttribute("data-snap");
  await drawer.getByRole("button", { name: /the panel$/ }).click();
  await expect(drawer).not.toHaveAttribute("data-snap", snap ?? "");
  expect(await types(page)).toHaveLength(start);
});

test("a course in Reviews pushes its page, and Back pops it", async ({
  page,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  const row = page.locator('[data-vt-course="CMSC351"]').first();
  await expect(row).toBeVisible();
  const start = (await types(page)).length;
  await row.click();
  await expect(page).toHaveURL(/\/reviews\/cmsc351$/);
  expect(await nextType(page, start)).toBe("push");
  await page.goBack();
  await expect(page).toHaveURL(/\/reviews$/);
  expect(await nextType(page, start + 1)).toBe("pop");
});

test("a Chat room opens with a push and closes with a pop", async ({
  page,
  isMobile,
}) => {
  // Someone new, with no classes: the finder opens any course's room.
  await page.goto("/privacy");
  const userId = `e2evt${Math.random().toString(36).slice(2, 10)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/chat" }),
    });
    const body: { return?: string } = await response.json();
    return body.return ?? "";
  }, userId);
  await page.goto(next);
  await page.getByRole("button", { name: "Find a course" }).click();
  const box = page.getByRole("searchbox", { name: "Find a course's chat" });
  await box.fill("cmsc131");
  await expect(
    page.getByRole("list", { name: "Courses" }).getByRole("button").first(),
  ).toContainText("CMSC131");

  const start = (await types(page)).length;
  await box.press("Enter");
  await expect(
    page.getByRole("textbox", { name: /^Message CMSC131/ }),
  ).toBeVisible();
  expect(await nextType(page, start)).toBe("push");
  // The room is in its place from the first frame: no slide of its own.
  expect(
    await page
      .getByRole("log", { name: "Messages" })
      .evaluate((log) => log.closest("section")?.getAnimations().length ?? 0),
  ).toBe(0);

  if (isMobile)
    await page
      .getByRole("link", { name: /Your classes/ })
      .first()
      .click();
  else await page.goBack();
  await expect(page).toHaveURL((url) => !url.searchParams.has("room"));
  expect(await nextType(page, start + 1)).toBe("pop");
});

test.describe("under Reduce Motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("push and pop change in place, and nothing slides", async ({ page }) => {
    await openSearch(page);
    const start = (await types(page)).length;
    await result(page, "CMSC131").click();
    await expect(page.locator(OPEN_VIEW)).toHaveText("CMSC131");
    expect(await nextType(page, start)).toBe("none");
    await page.goBack();
    await expect(page.locator(OPEN_VIEW)).toHaveCount(0);
    expect(await nextType(page, start + 1)).toBe("none");
  });

  test("another tab changes in place too", async ({ page, isMobile }) => {
    await openSearch(page);
    const start = (await types(page)).length;
    const tabs = isMobile
      ? page.locator("[data-workbench-drawer]").getByRole("navigation", {
          name: "Tabs",
        })
      : page.getByRole("navigation", { name: "Sidebar tabs" });
    await tabs.getByRole("button", { name: "Courses", exact: true }).click();
    await expect(page).toHaveURL(/\/schedule\/courses/);
    expect(await nextType(page, start)).toBe("none");
  });
});
