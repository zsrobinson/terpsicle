import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// The calendar on `pnpm dev:mock?demo=1` (the fixtures' demo plans): ghosts
// and switching, drag to block, course colors with undo, travel pills.

test.skip(({ isMobile }) => isMobile, "desktop interactions");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

test("open a course, see every section, and switch with a ghost", async ({
  page,
}) => {
  await calendar(page)
    .getByRole("button", { name: /^CMSC351 0301/ })
    .first()
    .click();
  await expect(
    page.getByText("Showing every section of CMSC351. Click one to switch."),
  ).toBeVisible();
  await expect(page.locator(OPEN_VIEW)).toContainText("CMSC351");
  const ghost = calendar(page)
    .getByRole("button", { name: /^Switch to 0201/ })
    .first();
  await expect(ghost).toBeVisible();

  await ghost.click();
  await expect(page.getByText("Switched CMSC351 to 0201")).toBeVisible();
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0201/ })
      .first(),
  ).toBeVisible();

  // Esc closes the course, and the ghosts with it.
  await page.keyboard.press("Escape");
  await expect(page.getByText(/Showing every section of/)).toHaveCount(0);
  await expect(calendar(page).locator("[data-ghost]")).toHaveCount(0);
});

test("drag on empty time to block it, and label it", async ({ page }) => {
  const wednesday = calendar(page).locator('[data-day="W"]');
  const box = await wednesday.boundingBox();
  if (!box) throw new Error("no Wednesday column");
  // 8am–9am on Wednesday is free in the demo plan.
  await page.mouse.move(box.x + 30, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.height * 0.08, { steps: 6 });
  await page.mouse.up();

  const popup = page.getByRole("dialog", { name: "New block" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Wed · 8am–");
  await popup
    .getByRole("textbox", { name: "Block label" })
    .fill("Office hours");
  await popup.getByRole("button", { name: "Add block" }).click();

  await expect(page.getByText('Added "Office hours"')).toBeVisible();
  await expect(
    calendar(page).getByRole("button", {
      name: /^Office hours, Wednesday 8am to /,
    }),
  ).toBeVisible();
});

/** A point on `day`'s column with nothing drawn on it (no class, ghost or pill). */
async function emptyPoint(page: Page, day: string) {
  const column = calendar(page).locator(`[data-day="${day}"]`);
  const point = await column.evaluate((el) => {
    const box = el.getBoundingClientRect();
    // Empty around the point too (a short drag's end): the hint floats over
    // the grid's top, and a press that ends on it isn't a press on the day.
    for (let y = box.top + 6; y < box.bottom - 6; y += 8) {
      const x = box.left + box.width / 2;
      if (
        document.elementFromPoint(x, y) === el &&
        document.elementFromPoint(x + 4, y + 8) === el
      )
        return { x, y };
    }
    return null;
  });
  if (!point) throw new Error(`nothing empty on ${day}`);
  return point;
}

test("while a course's sections show, a click on empty time closes them instead of blocking time", async ({
  page,
}) => {
  await calendar(page)
    .getByRole("button", { name: /^CMSC351 0301/ })
    .first()
    .click();
  await expect(
    page.getByText(/Showing every section of CMSC351/),
  ).toBeVisible();
  await expect(page.locator(OPEN_VIEW)).toContainText("CMSC351");

  // A drag there doesn't start a block either.
  const from = await emptyPoint(page, "W");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 3, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "New block" })).toHaveCount(0);
  await expect(page.locator(OPEN_VIEW)).toHaveCount(0);
  await expect(page.getByText(/Showing every section of/)).toHaveCount(0);
  await expect(calendar(page).locator("[data-ghost]")).toHaveCount(0);

  // Back reopens it: closing a view is a place in history.
  await page.goBack();
  await expect(page.locator(OPEN_VIEW)).toContainText("CMSC351");

  // A plain click does the same.
  const at = await emptyPoint(page, "M");
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(OPEN_VIEW)).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "New block" })).toHaveCount(0);
});

test("change a course's color, then undo it", async ({ page }) => {
  await calendar(page)
    .getByRole("button", { name: /^CMSC351 0301/ })
    .first()
    .click();
  // Course details has the same dot; this is the one over the calendar.
  await calendar(page)
    .getByRole("button", { name: "CMSC351 color: Violet" })
    .click();
  await page.getByRole("button", { name: "Teal" }).click();
  await expect(page.getByText("Changed CMSC351's color")).toBeVisible();
  await expect(
    calendar(page).getByRole("button", { name: "CMSC351 color: Teal" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Sidebar" })
      .getByRole("button", { name: "CMSC351 color: Teal" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    calendar(page).getByRole("button", { name: "CMSC351 color: Violet" }),
  ).toBeVisible();
});

test("a travel pill marks the demo's tight connection", async ({ page }) => {
  const pill = calendar(page).locator('[data-verdict="tight"]').first();
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText("8 min");
  await pill.hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Tight: 8 min to get there, 10 min between classes.",
  );
  await pill.click();
  await expect(page.locator(OPEN_VIEW)).toContainText("Connection");
});

test("travel pills step aside while a course's sections show", async ({
  page,
}) => {
  const pills = calendar(page).locator("[data-verdict]");
  await expect(pills.first()).toBeVisible();
  await calendar(page)
    .getByRole("button", { name: /^CMSC351 0301/ })
    .first()
    .click();
  await expect(calendar(page).locator("[data-ghost]").first()).toBeVisible();
  await expect(pills).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(pills.first()).toBeVisible();
});

test("a class's right-click menu is its row's, and Remove has Undo", async ({
  page,
}) => {
  // On a phone a long press opens the same items as a sheet (the kit's
  // ActionContextMenu; e2e/phone-menus.spec.ts).
  await calendar(page)
    .getByRole("button", { name: /^ECON200 0101/ })
    .first()
    .click({ button: "right" });
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "See sections and details" }),
  ).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Bookmark instead" }),
  ).toBeVisible();
  await menu.getByRole("menuitem", { name: "Remove from plan" }).click();
  await expect(
    calendar(page).getByRole("button", { name: /^ECON200 0101/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    calendar(page)
      .getByRole("button", { name: /^ECON200 0101/ })
      .first(),
  ).toBeVisible();
});
