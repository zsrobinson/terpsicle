import { expect, type Page, test } from "@playwright/test";

// The calendar on `pnpm dev:mock?demo=1` (the fixtures' demo plans): ghosts
// and switching, drag to block, course colors with undo, travel pills.

test.skip(({ isMobile }) => isMobile, "desktop interactions");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=1");
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
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("CMSC351");
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
    calendar(page).getByRole("button", { name: /^Office hours, 8am–/ }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Connection");
});
