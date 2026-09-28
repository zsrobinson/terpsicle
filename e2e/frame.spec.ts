import { expect, type Page, test } from "@playwright/test";

// The frame on an iPhone (the iPhone redesign's "frame and feedback"): edge
// to edge with the bars clear of the safe areas, the toolbar and status bar
// in the picked theme, a page that bounces only where it scrolls, and Share
// through the system's share sheet where a finger has one.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bar = (page: Page) => page.locator('[data-slot="app-bar"]');

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    bar(page).getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
}

/** The color the browser paints its toolbar with: the first tag that matches. */
function themeColor(page: Page) {
  return page.evaluate(() => {
    for (const meta of document.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )) {
      const media = meta.getAttribute("media");
      if (!media || window.matchMedia(media).matches) return meta.content;
    }
    return null;
  });
}

async function pickTheme(page: Page, theme: "System" | "Light" | "Dark") {
  await bar(page).getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("menuitemradio", { name: theme }).click();
  await page.keyboard.press("Escape");
}

test("the head runs the app edge to edge, in the app's colors", async ({
  page,
}) => {
  await page.goto("/reviews");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    "width=device-width, initial-scale=1, viewport-fit=cover",
  );
  // "default": black-translucent's words are always white, and would vanish
  // on light paper.
  await expect(
    page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
  ).toHaveAttribute("content", "default");
  await expect(
    page.locator('meta[name="theme-color"][media]'),
  ).toHaveCount(2);
});

test("the toolbar color follows a picked theme, and the system on System", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/reviews");
  await hydrated(page);
  const light = await themeColor(page);
  expect(light).toMatch(/^#[0-9a-f]{6}$/);

  await pickTheme(page, "Dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  const dark = await themeColor(page);
  expect(dark).not.toBe(light);
  // The paper the page paints is the color the toolbar gets.
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg")
        .trim(),
    ),
  ).toBe(dark);

  // Before the app's code runs, from the head script.
  await page.reload();
  expect(await themeColor(page)).toBe(dark);
  await hydrated(page);
  expect(await themeColor(page)).toBe(dark);

  await pickTheme(page, "System");
  expect(await themeColor(page)).toBe(light);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await themeColor(page)).toBe(dark);

  await pickTheme(page, "Light");
  expect(await themeColor(page)).toBe(light);
});

test("the app never bounces as a page; a page you read does", async ({
  page,
}) => {
  const overscroll = () =>
    page.evaluate(
      () => getComputedStyle(document.documentElement).overscrollBehaviorY,
    );
  await page.goto("/schedule");
  await expect(page.locator("[data-app-shell]")).toBeVisible();
  expect(await overscroll()).toBe("none");
  await page.goto("/reviews");
  await hydrated(page);
  expect(await overscroll()).toBe("auto");
});

test("the bar clears the notch", async ({ page }) => {
  await page.goto("/reviews");
  await hydrated(page);
  // Playwright can't give the page real safe areas; an iPhone's, by name.
  await page.addStyleTag({
    content: ":root { --safe-top: 47px; --safe-bottom: 34px; }",
  });
  const box = await bar(page).boundingBox();
  expect(box?.height).toBe(48 + 47);
  const signIn = await bar(page)
    .getByRole("button", { name: "Sign in" })
    .boundingBox();
  expect(signIn?.y).toBeGreaterThanOrEqual(47);
});

test.describe("Share", () => {
  /** Stands in for the system's share sheet; `null` takes it away. */
  async function shareSheet(page: Page, present: boolean) {
    await page.addInitScript((present) => {
      const shared: ShareData[] = [];
      Object.assign(window, { __shared: shared });
      Object.defineProperty(Navigator.prototype, "share", {
        configurable: true,
        value: present
          ? async (data: ShareData) => {
              shared.push(data);
            }
          : undefined,
      });
      Object.defineProperty(Navigator.prototype, "canShare", {
        configurable: true,
        value: present ? () => true : undefined,
      });
    }, present);
  }

  const shared = (page: Page) =>
    page.evaluate(
      () =>
        (window as unknown as { __shared: ShareData[] }).__shared.map(
          (data) => data.url ?? "",
        ),
    );

  async function openSchedule(page: Page) {
    await page.goto("/schedule/courses?demo=1");
    await expect(
      page.getByRole("navigation", { name: "Plans" }).getByRole("button", {
        name: "Plan A",
        exact: true,
      }),
    ).toBeVisible();
  }

  const shareButton = (page: Page) =>
    page.locator("[data-share-button]").filter({ visible: true });

  test("a phone hands the link to the share sheet; a desktop keeps the popover", async ({
    page,
    isMobile,
  }) => {
    await shareSheet(page, true);
    await openSchedule(page);
    await shareButton(page).click();
    const popover = page.getByRole("dialog", { name: "Share Plan A" });
    if (isMobile) {
      await expect.poll(() => shared(page)).toHaveLength(1);
      const [link = ""] = await shared(page);
      expect(new URL(link).pathname).toBe("/schedule");
      expect(new URL(link).searchParams.has("plan")).toBe(true);
      await expect(popover).toHaveCount(0);
    } else {
      await expect(popover).toBeVisible();
      await expect(
        popover.getByRole("button", { name: "Copy link" }),
      ).toBeVisible();
      expect(await shared(page)).toEqual([]);
    }
  });

  test("without a share sheet, a phone gets the popover and Copy link", async ({
    page,
  }) => {
    await shareSheet(page, false);
    await openSchedule(page);
    await shareButton(page).click();
    const popover = page.getByRole("dialog", { name: "Share Plan A" });
    await expect(popover).toBeVisible();
    await expect(
      popover.getByRole("button", { name: "Copy link" }),
    ).toBeVisible();
  });
});
