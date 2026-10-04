import { expect, type Locator, type Page, test } from "@playwright/test";

// Menus on a phone are sheets (docs/decisions.md, "Menus are ActionMenus"):
// a button's menu, a submenu inside one, and a row's long-press menu all open
// the same sheet, and the page scales back behind it, from inside the
// workbench drawer too. The kit's own page, then the scheduler's Courses tab.

test.skip(({ isMobile }) => !isMobile, "phones get sheets; desktops, menus");
test.describe.configure({ timeout: 90_000 });

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** A finger held on `target` past the long press, through touch input. */
async function longPress(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to press");
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [at],
  });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/** How far the page behind is scaled: 1 at rest, 0.98 behind a sheet. */
const scale = (page: Page) =>
  page
    .locator("[data-sheet-indent]")
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

/** The sheet's curve is 450ms. */
const settle = (page: Page) => page.waitForTimeout(600);

test("the kit's menu is a sheet, and its submenu takes the list's place", async ({
  page,
}) => {
  await page.goto(
    `/auth/test?return=${encodeURIComponent("/admin/kit?view=popups")}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await page.locator("[data-kit-menu]").tap();
  const sheet = page.getByRole("dialog", { name: "Plan A" });
  await expect(sheet).toHaveAttribute("data-slot", "action-sheet");
  await expect(
    sheet.getByRole("menuitemradio", { name: "Plan A" }),
  ).toHaveAttribute("aria-checked", "true");

  await sheet.getByRole("menuitem", { name: "Move to…" }).tap();
  await expect(sheet.getByRole("menuitem", { name: "Fall 2026" })).toBeVisible();
  await expect(sheet.getByRole("menuitem", { name: "Rename" })).toBeHidden();
  await sheet.getByRole("menuitem", { name: /^Move to…\s*, back$/ }).tap();
  await expect(sheet.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await sheet.getByRole("menuitem", { name: "Rename" }).tap();
  await expect(sheet).toBeHidden();
});

test("a row's long press opens its menu as a sheet", async ({ page }) => {
  await page.goto(
    `/auth/test?return=${encodeURIComponent("/admin/kit?view=popups")}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  const row = page.locator("[data-kit-context]");
  await row.scrollIntoViewIfNeeded();
  await longPress(page, row);
  const sheet = page.getByRole("dialog", { name: "CMSC216" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("menu", { name: "CMSC216" })).toBeVisible();
  // Not the desktop's little menu at the finger as well.
  await expect(page.locator('[data-slot="action-menu"]')).toHaveCount(0);
  await settle(page);
  expect(await scale(page)).toBeCloseTo(0.98, 2);
  await sheet.getByRole("menuitem", { name: "Show all sections" }).tap();
  await expect(sheet).toBeHidden();
});

test("a sheet from inside the workbench drawer scales the page back too", async ({
  page,
}) => {
  await page.goto("/schedule?demo=1");
  const drawer = page.locator("[data-workbench-drawer]");
  await expect(drawer).toBeVisible({ timeout: 20_000 });
  if ((await drawer.getAttribute("data-snap")) === "peek") {
    await page.getByRole("button", { name: "Raise the panel" }).tap();
    await expect(drawer).toHaveAttribute("data-snap", "half");
  }
  await page.getByRole("button", { name: "Actions for STAT400" }).tap();
  const sheet = page.getByRole("dialog", { name: "STAT400" });
  await expect(sheet).toHaveAttribute("data-slot", "action-sheet");
  await expect(page.locator("[data-sheet-indent]")).toHaveAttribute(
    "data-held",
  );
  await settle(page);
  expect(await scale(page)).toBeCloseTo(0.98, 2);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await settle(page);
  expect(await scale(page)).toBeCloseTo(1, 2);

  // A course row's long press opens the same actions.
  await longPress(page, page.getByTestId("course-row-STAT400"));
  await expect(page.getByRole("dialog", { name: "STAT400" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Remove from plan" }),
  ).toBeVisible();
});
