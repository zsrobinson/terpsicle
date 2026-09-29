import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The toasts on screen, not one on its way out. A toast shown again right
 * after Undo slides in while the undone one slides out, so for a moment the
 * same words are there twice (~/ui/toast).
 */
export function liveToasts(page: Page): Locator {
  return page.locator('[data-sonner-toast]:not([data-removed="true"])');
}

/**
 * On a phone with the drawer at half, the toast sits above the drawer, not
 * over its panel: there it covered what you tap next (a fix, then the next
 * problem's button) for the whole Undo window. Waits out its slide in.
 */
export async function expectToastAboveDrawer(page: Page): Promise<void> {
  const toast = liveToasts(page).first();
  const drawer = page.locator("[data-workbench-drawer]");
  await expect(toast).toBeVisible();
  await expect
    .poll(async () => {
      const [t, d] = await Promise.all([
        toast.boundingBox(),
        drawer.boundingBox(),
      ]);
      return t && d ? Math.round(d.y - (t.y + t.height)) : null;
    })
    .toBeGreaterThanOrEqual(0);
}
