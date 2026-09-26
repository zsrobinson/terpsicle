import { expect, type Page, test } from "@playwright/test";

// The phone drawer with the on-screen keyboard up. The owner: "typing into
// the search box makes everything on the drawer disappear". Headless
// Chromium has no on-screen keyboard, so these fake one the way a phone
// reports it: the visual viewport gets shorter and fires `resize`, while the
// layout viewport (`innerHeight`) stays put.

test.skip(({ isMobile }) => !isMobile, "phone layout");

const drawer = (page: Page) => page.locator("[data-vaul-drawer]");
const tabs = (page: Page) =>
  page.getByRole("navigation", { name: "Tabs", exact: true });

/** Shows (px > 0) or hides (0) a keyboard `px` tall. */
async function keyboard(page: Page, px: number): Promise<void> {
  await page.evaluate((height) => {
    const vv = window.visualViewport;
    if (!vv) throw new Error("no visualViewport");
    Object.defineProperty(vv, "height", {
      configurable: true,
      get: () => window.innerHeight - height,
    });
    vv.dispatchEvent(new Event("resize"));
  }, px);
}

const KEYBOARD = 300;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
});

test("typing a search with the keyboard up shows the results above it", async ({
  page,
}) => {
  await tabs(page).getByRole("button", { name: "Search" }).tap();
  const box = page.getByRole("combobox", { name: "Search courses" });
  await box.tap();
  // Up at once, before the keyboard: a phone pans the page to the field if
  // the keyboard would cover it where it sits at half.
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
  await keyboard(page, KEYBOARD);
  await box.fill("cmsc");
  const results = page.locator("#search-results");
  const first = results.locator("[data-course-result]").first();
  await expect(first).toBeVisible();

  // The drawer rises all the way, so the results get the room left over.
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
  const keyboardTop = await page.evaluate(
    (px) => window.innerHeight - px,
    KEYBOARD,
  );
  await expect
    .poll(
      async () => (await first.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
    )
    .toBeLessThan(keyboardTop - 40);
  // The search box and the first result are both above the keyboard, and the
  // list ends where the keyboard starts, so its last row can be scrolled to.
  const boxBottom = await box.evaluate(
    (el) => el.getBoundingClientRect().bottom,
  );
  expect(boxBottom).toBeLessThan(keyboardTop);
  // (Polled: the drawer may still be sliding up.)
  const listBottom = () =>
    results.evaluate((el) => el.getBoundingClientRect().bottom);
  await expect.poll(listBottom).toBeLessThanOrEqual(keyboardTop + 1);
  expect(await listBottom()).toBeGreaterThan(keyboardTop - 60);
  // The drawer itself keeps its size: nothing squeezes it to its header.
  const height = await drawer(page).evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  expect(height).toBeGreaterThan(keyboardTop);

  // Keyboard down: the list runs to the bottom of the screen again.
  await keyboard(page, 0);
  await expect
    .poll(() => results.evaluate((el) => el.getBoundingClientRect().bottom))
    .toBeGreaterThan(keyboardTop + KEYBOARD - 60);
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
});

test("a tapped field is already at the top when the keyboard opens", async ({
  page,
}) => {
  // The owner: "the keyboard pushing up the content of the page … you're no
  // longer able to see where you're typing". Tapped at half, the field used
  // to ride vaul's half-second slide up to full. The keyboard opened
  // mid-slide, the phone panned the page to the field where it was then, and
  // the drawer carried it on up, out of the panned view (the mobile lab's
  // keyboard-at-half on Android Chrome). Now it jumps: right after the tap,
  // the drawer is at full and the field under the tab strip.
  await tabs(page).getByRole("button", { name: "Search" }).tap();
  const grabber = drawer(page).getByRole("button", { name: /the panel$/ });
  for (
    let i = 0;
    i < 3 && (await drawer(page).getAttribute("data-snap")) !== "half";
    i++
  ) {
    await grabber.tap();
    await page.waitForTimeout(600);
  }
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
  await page.waitForTimeout(600);

  const box = page.getByRole("combobox", { name: "Search courses" });
  await box.tap();
  const at = await page.evaluate(() => ({
    drawer: document
      .querySelector("[data-vaul-drawer]")
      ?.getBoundingClientRect().top,
    field: document
      .querySelector('[aria-label="Search courses"]')
      ?.getBoundingClientRect().top,
  }));
  expect(at.drawer).toBeLessThanOrEqual(48 + 1);
  expect(at.field).toBeLessThan(200);
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
});

test("the keyboard alone doesn't move the drawer", async ({ page }) => {
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
  await keyboard(page, KEYBOARD);
  await page.waitForTimeout(100);
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
});
