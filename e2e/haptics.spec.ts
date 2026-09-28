import { expect, test } from "@playwright/test";

// The iPhone haptic overlay (src/components/ui/haptic.tsx) in a real
// browser: Chromium dressed as an iPhone, so the kit draws its invisible
// native switches, and a finger's tap must still reach each control exactly
// once. Only a real iPhone can feel the tick (docs/MOBILE-TESTING.md); this
// holds the wiring, on the kit page, where every control is.

test.skip(({ isMobile }) => !isMobile, "Only iPhones get the overlay");

test.use({
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
});

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // What an iPhone has and hasn't: no vibrate(), five touch points.
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "vibrate");
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
      get: () => 5,
    });
    // An iPhone's first sign-in asks to add Terpsicle to the Home Screen;
    // two "Not now"s keep that dialog (and its modal layer) away.
    localStorage.setItem(
      "terpsicle:install-prompt",
      JSON.stringify({
        dismissals: 2,
        lastDismissedAt: new Date().toISOString(),
      }),
    );
  });
  await page.goto(
    `/auth/test?return=${encodeURIComponent("/admin/kit?view=controls")}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/kit\?view=controls$/);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("a tap through the overlay chooses, switches views and toggles, once each", async ({
  page,
}) => {
  const main = page.getByRole("main");

  // A segment: the tap lands on its switch, and the choice moves once.
  const pace = main.getByRole("radiogroup", { name: "Your pace" });
  const faster = pace.getByRole("radio", { name: "Faster" });
  await expect(faster.locator("input[data-haptic-tap]")).toBeAttached();
  await faster.scrollIntoViewIfNeeded();
  const hit = await faster.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const at = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return at?.hasAttribute("data-haptic-tap") ?? false;
  });
  expect(hit, "the finger lands on the overlay").toBe(true);
  await faster.tap();
  await expect(faster).toBeChecked();
  // The current segment has none: tapping it changes nothing, so no tick.
  await expect(faster.locator("input[data-haptic-tap]")).toHaveCount(0);
  await expect(
    pace.getByRole("radio", { name: "Typical" }).locator("input"),
  ).toHaveCount(1);

  // A switch: toggled once, not twice.
  const accessible = main.getByRole("switch", { name: /Accessible routes/ });
  const was = await accessible.getAttribute("aria-checked");
  await accessible.tap();
  await expect(accessible).not.toHaveAttribute("aria-checked", was ?? "");
  // One that can't switch has no overlay: it doesn't tick.
  await expect(
    main
      .getByRole("switch", { name: "Seat openings: Text" })
      .locator("input[data-haptic-tap]"),
  ).toHaveCount(0);

  // A view: the router's link takes the forwarded click, one navigation.
  const views = main.getByRole("navigation", { name: "Parts of the kit" });
  const before = await page.evaluate(() => history.length);
  await views.getByRole("link", { name: "Lists" }).tap();
  await expect(page).toHaveURL(/\/admin\/kit\?view=lists$/);
  await expect(views.getByRole("link", { name: "Lists" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
});

test("the keyboard never meets the overlay", async ({ page }) => {
  const pace = page
    .getByRole("main")
    .getByRole("radiogroup", { name: "Your pace" });
  await pace.getByRole("radio", { name: "Typical" }).focus();
  await page.keyboard.press("ArrowRight");
  const faster = pace.getByRole("radio", { name: "Faster" });
  await expect(faster).toBeFocused();
  await expect(faster).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.locator("input[data-haptic-tap]:focus")).toHaveCount(0);
});
