import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// Each rail tab and drill-in is a route (src/app/README.md, "URL state") on
// `pnpm dev:mock?demo=1`: the scheduler's old-style URLs redirect to them,
// replacing the entry; Back and Forward are the router's history across
// tabs and drill-ins; a reload stays put; the router loads a tab's route on
// intent; and on a phone the drawer's views follow Back too.

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const block = (page: Page, code: string) =>
  calendar(page)
    .getByRole("button", { name: new RegExp(`^${code} \\d{4}`) })
    .first();
const openView = (page: Page) => page.locator(OPEN_VIEW);
const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Sidebar tabs" });
const railTab = (page: Page, name: string) =>
  rail(page).getByRole("button", { name, exact: true });
const path = (page: Page) => new URL(page.url()).pathname;
const param = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);

/**
 * Opens `url` after another page, so Back shows whether it was replaced,
 * and waits for the demo plan's calendar (the Spring term's).
 */
async function arrive(page: Page, url: string, { spring = true } = {}) {
  await page.goto("/privacy");
  await page.goto(url);
  if (spring)
    await expect(block(page, "CMSC351")).toBeVisible({ timeout: 20_000 });
}

test.describe("old-style URLs redirect to their routes, replacing the entry", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("?course= (a course link) opens course details over Courses", async ({
    page,
  }) => {
    await arrive(page, "/schedule?demo=1&course=cmsc330");
    await expect(page).toHaveURL(/\/schedule\/course\/CMSC330\?/);
    expect(param(page, "tab")).toBe("courses");
    await expect(openView(page)).toHaveText("CMSC330");
    // Under it, the tab's own view; under that, where we came from.
    await page.goBack();
    await expect(page).toHaveURL(/\/schedule\/courses\?/);
    await expect(openView(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("?tab=search&q= opens Search with its text", async ({ page }) => {
    await arrive(page, "/schedule?demo=1&tab=search&q=cmsc&openSeats=1");
    await expect(page).toHaveURL(/\/schedule\/search\?/);
    expect(param(page, "q")).toBe("cmsc");
    expect(param(page, "openSeats")).toBe("1");
    await expect(
      page.getByRole("combobox", { name: "Search courses" }),
    ).toHaveValue("cmsc");
    await expect(
      page.getByRole("button", { name: "Open seats" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("?tab=generate opens Generate", async ({ page }) => {
    await arrive(page, "/schedule?demo=1&tab=generate");
    await expect(page).toHaveURL(/\/schedule\/generate\?/);
    await expect(railTab(page, "Generate")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("combobox", { name: "Add a course" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test("?result= (a generated plan, gone after a reload) opens Generate's form", async ({
    page,
  }) => {
    await arrive(page, "/schedule?demo=1&tab=generate&view=results&result=r1");
    await expect(page).toHaveURL(/\/schedule\/generate\?/);
    expect(param(page, "view")).toBeNull();
    await expect(openView(page)).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Add a course" }),
    ).toBeVisible();
  });

  test("?connection= opens connection details over its tab", async ({
    page,
  }) => {
    const id = "M:STAT400-0101#0>CMSC351-0301#0";
    await arrive(
      page,
      `/schedule?demo=1&tab=travel&connection=${encodeURIComponent(id)}`,
    );
    await expect(openView(page)).toHaveText("Connection");
    expect(decodeURIComponent(path(page))).toBe(`/schedule/connection/${id}`);
    expect(param(page, "tab")).toBe("travel");
    await expect(railTab(page, "Travel")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
  });

  test("?term= alone opens the saved view in that term", async ({ page }) => {
    await arrive(page, "/schedule?demo=1&term=202605", { spring: false });
    await expect(page).toHaveURL(/\/schedule\/courses\?/, {
      timeout: 20_000,
    });
    expect(param(page, "term")).toBe("202605");
    await expect(
      page.getByRole("button", { name: /Summer 2026/ }),
    ).toBeVisible();
  });

  test("a plain /schedule opens the saved view", async ({ page }) => {
    await arrive(page, "/schedule?demo=1");
    await railTab(page, "Travel").click();
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
    await expect(railTab(page, "Travel")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

test.describe("history", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("Back and Forward go across tabs and drill-ins", async ({ page }) => {
    await arrive(page, "/schedule?demo=1");
    await railTab(page, "Travel").click();
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
    await calendar(page)
      .locator('[data-day="M"] [data-verdict]')
      .first()
      .click();
    await expect(openView(page)).toHaveText("Connection");
    await expect(page).toHaveURL(/\/schedule\/connection\//);
    await block(page, "CMSC330").click();
    await expect(openView(page)).toHaveText("CMSC330");
    await railTab(page, "Search").click();
    await expect(page).toHaveURL(/\/schedule\/search\?/);

    await page.goBack();
    await expect(openView(page)).toHaveText("CMSC330");
    await expect(
      page.getByRole("button", { name: "Back to Connection" }),
    ).toBeVisible();
    await page.goBack();
    await expect(openView(page)).toHaveText("Connection");
    await page.goBack();
    await expect(openView(page)).toHaveCount(0);
    await expect(railTab(page, "Travel")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/schedule\/courses\?/);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();

    await page.goForward();
    await page.goForward();
    await expect(openView(page)).toHaveText("Connection");
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC330");
    await page.goForward();
    await expect(page).toHaveURL(/\/schedule\/search\?/);
    await expect(openView(page)).toHaveCount(0);
  });

  test("a reload on a drill-in shows it again, and Back still works", async ({
    page,
  }) => {
    await arrive(page, "/schedule?demo=1");
    await railTab(page, "Travel").click();
    await calendar(page)
      .locator('[data-day="M"] [data-verdict]')
      .first()
      .click();
    await expect(openView(page)).toHaveText("Connection");
    const before = page.url();

    await page.reload();
    await expect(openView(page)).toHaveText("Connection", { timeout: 20_000 });
    expect(page.url()).toBe(before);
    await expect(page.getByTestId("verdict")).toBeVisible();
    await page.getByRole("button", { name: "Back to Travel" }).click();
    await expect(openView(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
  });
});

test("a tab's route loads on hover, before the click", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the rail is desktop's");
  // The tab's component, split out of its route file by the router: in dev,
  // the route file with `?tsr-split=component`; in a build, its own chunk.
  const travelChunk =
    /schedule\.travel\.tsx\?tsr-split=component|\/schedule\.travel-[\w-]+\.js/;
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await arrive(page, "/schedule?demo=1");
  expect(requested.filter((url) => travelChunk.test(url))).toEqual([]);

  const loaded = page.waitForRequest(travelChunk);
  await railTab(page, "Travel").hover();
  await loaded;
  await railTab(page, "Travel").click();
  await expect(page).toHaveURL(/\/schedule\/travel\?/);
  await expect(
    page.getByRole("complementary", { name: "Sidebar" }).getByRole("heading", {
      name: "Travel",
    }),
  ).toBeVisible();
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  test("the drawer's tabs and drill-ins follow Back and Forward", async ({
    page,
  }) => {
    await arrive(page, "/schedule?demo=1");
    const drawer = page.locator("[data-snap]");
    await drawer.getByRole("button", { name: "Travel" }).click();
    await expect(page).toHaveURL(/\/schedule\/travel\?/);
    // Opening a tab raises a resting drawer.
    await expect(drawer).toHaveAttribute("data-snap", "half");
    await block(page, "CMSC351").click();
    await expect(openView(page)).toHaveText("CMSC351");
    await expect(
      drawer.getByRole("button", { name: "Back to Travel" }),
    ).toBeVisible();

    // The phone's back gesture is the browser's Back.
    await page.goBack();
    await expect(openView(page)).toHaveCount(0);
    await expect(
      drawer.getByRole("button", { name: "Travel" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goForward();
    await expect(openView(page)).toHaveText("CMSC351");
    await drawer.getByRole("button", { name: "Back to Travel" }).click();
    await expect(openView(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/schedule\/courses\?/);
    await expect(page.getByTestId("course-row-CMSC351")).toBeVisible();
  });
});
