import type { Locator, Page } from "@playwright/test";

/**
 * The toasts on screen, not one on its way out. A toast shown again right
 * after Undo slides in while the undone one slides out, so for a moment the
 * same words are there twice (~/ui/toast).
 */
export function liveToasts(page: Page): Locator {
  return page.locator('[data-sonner-toast]:not([data-removed="true"])');
}
