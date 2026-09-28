import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The kit's sheet (Base UI's Drawer) and ActionMenu, on /admin/kit under a
// finger: a drag between detents, a fling that dismisses, a tap above, and
// the page scaling back behind it; the menu that's a sheet on a phone. Axe
// in both themes.

// Axe scans in both themes, on a busy machine.
test.describe.configure({ timeout: 90_000 });

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/auth/test?return=${encodeURIComponent("/admin/kit?view=controls")}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await expect(
    page.getByRole("heading", { name: "Action menu", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

interface Point {
  x: number;
  y: number;
}

/**
 * One finger from `from` to `to` through the browser's touch input, a frame
 * per step. `fling` moves in three quick steps, as a flick; otherwise the
 * finger rests before it lifts, so the release carries no speed.
 */
async function drag(page: Page, from: Point, to: Point, fling = false) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: Point[],
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [from]);
  const steps = fling ? 3 : 16;
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", [
      {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      },
    ]);
    if (!fling)
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
  }
  if (!fling) await page.waitForTimeout(300);
  await touch("touchEnd", []);
  await cdp.detach();
}

/** The sheet's curve is 450ms. */
const settle = (page: Page) => page.waitForTimeout(600);

async function grabberCenter(page: Page): Promise<Point> {
  const box = await page
    .locator('[data-slot="sheet-grabber"]')
    .first()
    .boundingBox();
  if (!box) throw new Error("the grabber isn't on screen");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the sheet's gestures are touch");

  test("drags between detents, flings away, and the page scales back behind it", async ({
    page,
  }) => {
    const behind = page.locator("[data-sheet-indent]");
    await page.getByRole("button", { name: "Open the sheet at medium" }).tap();
    const sheet = page.getByRole("dialog", { name: "Notifications" });
    await expect(sheet).toHaveAttribute("data-detent", "medium");
    await expect(behind).toHaveAttribute("data-active");
    await settle(page);
    // Half the screen, give or take the grabber.
    const medium = await sheet.boundingBox();
    expect(medium?.y).toBeGreaterThan(844 * 0.45);
    const scale = await behind.evaluate(
      (el) => new DOMMatrix(getComputedStyle(el).transform).a,
    );
    expect(scale).toBeCloseTo(0.98, 2);

    // Up to large, by a slow drag on the grabber.
    let at = await grabberCenter(page);
    await drag(page, at, { x: at.x, y: at.y - 360 });
    await expect(sheet).toHaveAttribute("data-detent", "large");
    await settle(page);
    // And back down to medium.
    at = await grabberCenter(page);
    await drag(page, at, { x: at.x, y: at.y + 360 });
    await expect(sheet).toHaveAttribute("data-detent", "medium");
    await settle(page);

    // A quick flick down dismisses it from medium, and the page comes back.
    at = await grabberCenter(page);
    await drag(page, at, { x: at.x, y: at.y + 160 }, true);
    await expect(sheet).toBeHidden();
    await expect(behind).not.toHaveAttribute("data-active");

    // A tap above it closes it too; the grabber's tap steps a detent.
    await page.getByRole("button", { name: "Open the sheet at medium" }).tap();
    await expect(sheet).toHaveAttribute("data-detent", "medium");
    await settle(page);
    await page.getByRole("button", { name: "Raise the sheet" }).tap();
    await expect(sheet).toHaveAttribute("data-detent", "large");
    await settle(page);
    await page.touchscreen.tap(195, 8);
    await expect(sheet).toBeHidden();
  });

  test("the fitting sheet swipes away", async ({ page }) => {
    await page
      .getByRole("button", { name: "Open the sheet", exact: true })
      .tap();
    const sheet = page.getByRole("dialog", { name: "Notifications" });
    await expect(sheet).toBeVisible();
    await expect(sheet).not.toHaveAttribute("data-detent");
    await settle(page);
    const box = await sheet.boundingBox();
    if (!box) throw new Error("the sheet isn't on screen");
    const top = { x: box.x + box.width / 2, y: box.y + 10 };
    await drag(page, top, { x: top.x, y: top.y + 120 }, true);
    await expect(sheet).toBeHidden();
  });
});

test("the action menu: a menu from md up, a sheet on a phone", async ({
  page,
  isMobile,
}) => {
  const trigger = page.getByRole("button", { name: "Plan A", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  if (isMobile) await trigger.tap();
  else await trigger.click();
  const surface = isMobile
    ? page.getByRole("dialog", { name: "Plans" })
    : page.getByRole("menu", { name: "Plans" });
  await expect(surface).toBeVisible();
  await expect(
    surface.getByRole("menuitemradio", { name: /Plan A/ }),
  ).toHaveAttribute("aria-checked", "true");
  await settle(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(
      page,
      `the plans ${isMobile ? "sheet" : "menu"} (${colorScheme})`,
    );
  }
  await page.emulateMedia({ colorScheme: "light" });
  const planB = surface.getByRole("menuitemradio", { name: /Plan B/ });
  if (isMobile) await planB.tap();
  else await planB.click();
  await expect(surface).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Plan B", exact: true }),
  ).toBeVisible();
});

test("the sheets pass axe in both themes", async ({ page, isMobile }) => {
  for (const name of ["Open the sheet", "Open the sheet at medium"]) {
    const open = page.getByRole("button", { name, exact: true });
    if (isMobile) await open.tap();
    else await open.click();
    const sheet = page.getByRole("dialog", { name: "Notifications" });
    await expect(sheet).toBeVisible();
    await settle(page);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await scan(page, `${name} (${colorScheme})`);
    }
    await page.emulateMedia({ colorScheme: "light" });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
});
