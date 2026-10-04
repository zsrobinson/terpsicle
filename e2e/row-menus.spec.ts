import { expect, type Locator, type Page, test } from "@playwright/test";

// A row keeps the highlight it shows under the pointer while its own menu is
// open, its ⋯ menu or its right-click menu (the `menu-open` variant in
// src/styles.css), as it did before menus were the kit's ActionMenu (#238).

test.skip(({ isMobile }) => isMobile, "a pointer's hover, on a desktop");

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Its background once its color transition has run. */
function background(el: Locator) {
  return el.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((a) => a.finished));
    return getComputedStyle(node).backgroundColor;
  });
}

/**
 * A move of the pointer over the calendar, away from every row. (Measured up
 * front: a right-click menu hides the page from the accessibility tree.)
 */
async function awayFromRows(page: Page) {
  const box = await page
    .getByRole("region", { name: "Week calendar" })
    .boundingBox();
  if (!box) throw new Error("No calendar on the page");
  const x = box.x + box.width - 20;
  const y = box.y + box.height - 20;
  return () => page.mouse.move(x, y);
}

test("a Courses row stays lit while its menu is open", async ({ page }) => {
  await page.goto("/schedule?demo=1");
  const name = page.getByTestId("course-row-STAT400");
  await expect(name).toBeVisible({ timeout: 20_000 });
  // The ListRow: the first child of the row's <li>.
  const row = name.locator("xpath=ancestor::li[1]/*[1]");

  const away = await awayFromRows(page);
  await away();
  const rest = await background(row);
  await row.hover();
  const lit = await background(row);
  expect(lit).not.toBe(rest);

  // Its ⋯ menu, with the pointer gone from the row.
  await page.getByRole("button", { name: "Actions for STAT400" }).click();
  const menu = page.getByRole("menu", { name: "STAT400" });
  await expect(menu).toBeVisible();
  await away();
  await expect(menu).toBeVisible();
  await expect.poll(() => background(row)).toBe(lit);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect.poll(() => background(row)).toBe(rest);

  // Its right-click menu.
  await name.click({ button: "right" });
  await expect(menu).toBeVisible();
  await away();
  await expect.poll(() => background(row)).toBe(lit);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect.poll(() => background(row)).toBe(rest);

  // Another row stays as it was.
  const other = page
    .getByTestId("course-row-CMSC351")
    .locator("xpath=ancestor::li[1]/*[1]");
  await page.getByRole("button", { name: "Actions for STAT400" }).click();
  await expect(menu).toBeVisible();
  await away();
  await expect.poll(() => background(other)).toBe(rest);
  await page.keyboard.press("Escape");
});
