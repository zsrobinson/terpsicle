import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";
import { liveToasts } from "./toasts";

// The phone's tab bar (docs/decisions.md, "Phones get a tab bar"; CONTEXT.md,
// "Tab bar"): Home and the five products, six labeled tabs edge to edge,
// whole at 375 and 393 points, each a 44px link with the one you're on
// current. The workbench drawer rests on it and covers it at full; a text
// field's keyboard and a Chat room take its place; toasts sit above it. The
// phone's term and plan are one control in the family bar, opening one sheet.

test.skip(({ isMobile }) => !isMobile, "the tab bar is a phone's");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const TABS = ["Home", "Schedule", "Reviews", "Chat", "Plan", "Todo"];

const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Tab bar" });
const drawer = (page: Page) => page.locator("[data-workbench-drawer]");

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
}

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).first().boundingBox();
  if (!found) throw new Error(`no box for ${selector}`);
  return found;
}

for (const width of [375, 393])
  test(`six whole labels at ${width}pt, 44px each, edge to edge, where you are current`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/reviews");
    await hydrated(page);
    const links = tabBar(page).getByRole("link");
    await expect(links).toHaveText(TABS);
    await expect(
      tabBar(page).getByRole("link", { name: "Reviews" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(tabBar(page).locator("[aria-current]")).toHaveCount(1);

    const bar = await box(page, "[data-tab-bar]");
    expect(Math.round(bar.x)).toBe(0);
    expect(Math.round(bar.width)).toBe(width);
    for (const name of TABS) {
      const link = tabBar(page).getByRole("link", { name });
      const size = await link.boundingBox();
      expect(size?.height, name).toBeGreaterThanOrEqual(44);
      expect(size?.width, name).toBeGreaterThanOrEqual(44);
      // The word shows whole, not "Sched…".
      expect(
        await link
          .locator("span")
          .first()
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        name,
      ).toBe(true);
    }
    // The product menu gave its place to the tab bar.
    await expect(
      page.getByRole("banner").getByRole("button", { name: /^Terpsicle/ }),
    ).toBeHidden();
    await scan(page, `tab bar at ${width}`);
  });

test("a tap goes there; the tab you're on goes back to the top", {
  tag: "@phone",
}, async ({ page }) => {
  await page.goto("/reviews");
  await hydrated(page);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  await tabBar(page).getByRole("link", { name: "Reviews" }).tap();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page).toHaveURL(/\/reviews\/?$/);

  await tabBar(page).getByRole("link", { name: "Home" }).tap();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    tabBar(page).getByRole("link", { name: "Home" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good /);
});

test("the drawer rests on the tab bar, and pulled all the way up covers it", async ({
  page,
}) => {
  await page.goto("/schedule/courses?demo=1");
  await expect(drawer(page)).toBeVisible();
  await expect(tabBar(page)).toBeVisible();
  // The demo's plan has classes: the drawer rests at peek.
  await expect(drawer(page)).toHaveAttribute("data-snap", "peek");
  await expect(page.locator("html")).toHaveAttribute(
    "data-drawer-snap",
    "peek",
  );
  // At peek, the drawer's strip and its panel's header sit above the bar.
  const bar = await box(page, "[data-tab-bar]");
  await expect
    .poll(async () => {
      const strip = await page
        .getByRole("navigation", { name: "Tabs", exact: true })
        .boundingBox();
      return strip ? strip.y + strip.height <= bar.y : false;
    })
    .toBe(true);
  const header = await drawer(page)
    .getByText("Plan A", { exact: true })
    .boundingBox();
  expect((header?.y ?? 0) + (header?.height ?? 0)).toBeLessThanOrEqual(bar.y);

  // At full, the tab bar steps aside; any lower snap brings it back.
  await page.getByRole("button", { name: "Raise the panel" }).tap();
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
  await expect(tabBar(page)).toBeVisible();
  await page.getByRole("button", { name: "Raise the panel" }).tap();
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
  await expect(tabBar(page)).toBeHidden();
  await page.getByRole("button", { name: "Lower the panel" }).tap();
  await expect(drawer(page)).toHaveAttribute("data-snap", "peek");
  await expect(tabBar(page)).toBeVisible();
});

test("a text field with the keyboard up hides it", async ({ page }) => {
  await page.goto("/reviews");
  await hydrated(page);
  const field = page.getByPlaceholder(/^Search instructors and courses/);
  await field.tap();
  await expect(field).toBeFocused();
  await expect(tabBar(page)).toBeHidden();
  await field.blur();
  await expect(tabBar(page)).toBeVisible();
});

test("a Chat room takes the bottom for its composer", async ({ page }) => {
  await page.goto(`/auth/test?return=${encodeURIComponent("/chat")}`);
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/chat"));
  // The first room of the first class, whatever the account's plans hold.
  const room = page
    .getByRole("list", { name: "Your classes" })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first();
  await expect(room).toBeVisible({ timeout: 20_000 });
  await expect(tabBar(page)).toBeVisible();
  await room.tap();
  await expect(page).toHaveURL(/room=/);
  await expect(tabBar(page)).toBeHidden();
  await page
    .getByRole("link", { name: "Your classes" })
    .or(page.getByRole("button", { name: "Your classes" }))
    .tap();
  await expect(page).not.toHaveURL(/room=/);
  await expect(tabBar(page)).toBeVisible();
});

test("toasts sit above it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-28T13:00:00Z"));
  await page.goto("/home");
  await hydrated(page);
  const close = page
    .locator("[data-home-callout]")
    .first()
    .getByRole("button", { name: /^Close/ });
  await close.tap();
  const toast = liveToasts(page).first();
  await expect(toast).toBeVisible();
  const bar = await box(page, "[data-tab-bar]");
  await expect
    .poll(async () => {
      const t = await toast.boundingBox();
      return t ? Math.round(bar.y - (t.y + t.height)) : null;
    })
    .toBeGreaterThanOrEqual(0);
});

test("the term and the plan are one control, opening the plans sheet", async ({
  page,
}) => {
  await page.goto("/schedule/courses?demo=1");
  const bar = page.getByRole("banner");
  const plans = bar.getByRole("button", { name: /Plan A/ });
  await expect(plans).toBeVisible();
  // No plan tabs and no second term control on a phone.
  await expect(page.getByRole("navigation", { name: "Plans" })).toHaveCount(0);
  await plans.tap();
  const sheet = page.getByRole("dialog", { name: "Plans" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Spring 2027");
  await expect(
    sheet.getByRole("menuitemradio", { name: /^Plan A/ }),
  ).toHaveAttribute("aria-checked", "true");
  for (const name of [/^New plan/, /^Duplicate Plan A/, /^Delete Plan A/])
    await expect(sheet.getByRole("menuitem", { name })).toBeVisible();
  await expect(
    sheet.getByRole("menuitemradio", { name: /^Spring 2027/ }),
  ).toBeVisible();
  await scan(page, "plans sheet");

  await sheet.getByRole("menuitemradio", { name: /^Plan B/ }).tap();
  await expect(sheet).toBeHidden();
  await expect(bar.getByRole("button", { name: /Plan B/ })).toBeVisible();

  // A new plan opens, and Delete has Undo.
  await bar.getByRole("button", { name: /Plan B/ }).tap();
  await page.getByRole("menuitem", { name: /^New plan/ }).tap();
  await expect(bar.getByRole("button", { name: /Plan C/ })).toBeVisible();
  await bar.getByRole("button", { name: /Plan C/ }).tap();
  await page.getByRole("menuitem", { name: /^Delete Plan C/ }).tap();
  await expect(bar.getByRole("button", { name: /Plan C/ })).toHaveCount(0);
  await expect(
    liveToasts(page).getByRole("button", { name: "Undo" }),
  ).toBeVisible();
});
