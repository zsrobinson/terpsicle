import { expect, type Locator, type Page, test } from "@playwright/test";

// The family bar's product tabs and its account cluster (the owner,
// 2026-09-29 and 2026-09-30): the product you're on is named, the others
// are marks, Home's are all marks, and hovering or tabbing to a tab opens
// that one tab's name without moving the tab under the pointer. At the
// bar's end, the same cluster on every page: Feedback (labeled), the bell,
// Support and the account.

let errors: string[] = [];

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone's tab bar moves between products");
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bar = (page: Page) => page.locator('[data-slot="app-bar"]');
const tabs = (page: Page) =>
  bar(page).getByRole("navigation", { name: "Products" });
const tab = (page: Page, name: string) =>
  tabs(page).getByRole("link", { name, exact: true });

/** How wide a tab's name is drawn: 0 folded, its text's width open. */
const nameWidth = (link: Locator) =>
  link
    .locator("[data-tab-name]")
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));

/** The page's code is running: the account answers once /api/me does. */
async function hydrated(page: Page) {
  await expect(
    bar(page).getByRole("button", { name: /^(Sign in|Account: )/ }),
  ).toBeVisible();
}

async function openNames(page: Page) {
  const names: string[] = [];
  for (const name of ["Schedule", "Reviews", "Chat", "Todo"])
    if ((await nameWidth(tab(page, name))) > 0) names.push(name);
  return names;
}

/**
 * Moves the pointer to `point` and records, every frame for `ms`, which tab
 * is under it: the reveal must never slide another tab under the pointer.
 */
async function tabsUnder(
  page: Page,
  point: { x: number; y: number },
  ms = 700,
) {
  await page.evaluate(
    ({ x, y, ms }) => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      const start = performance.now();
      const frame = () => {
        const el = document.elementFromPoint(x, y);
        // A product switch's view transition hits the root, not the page,
        // until its snapshots go: those frames have no tab to be under.
        if (el !== document.documentElement)
          seen.push(
            el?.closest<HTMLElement>("[data-product-tab]")?.dataset
              .productTab ?? "none",
          );
        if (performance.now() - start < ms) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    { ...point, ms },
  );
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(ms + 100);
  return page.evaluate(() => (window as unknown as { seen: string[] }).seen);
}

async function center(link: Locator) {
  const box = await link.boundingBox();
  if (!box) throw new Error("the tab isn't drawn");
  // Over the mark, nearer the tab's left edge, which never moves.
  return { x: box.x + 16, y: box.y + box.height / 2 };
}

test("every page names the product you're on and shows the others as marks; Home, only marks", async ({
  page,
}) => {
  for (const [path, named] of [
    ["/reviews", ["Reviews"]],
    ["/chat", ["Chat"]],
    ["/todo", ["Todo"]],
    ["/schedule?demo=1", ["Schedule"]],
    ["/home", []],
    ["/settings", []],
  ] as const) {
    await page.goto(path);
    await hydrated(page);
    await page.mouse.move(700, 600);
    await expect.poll(() => openNames(page), { message: path }).toEqual(named);
  }
  // Folded, a tab still has its name, and a tooltip says where it goes.
  await tab(page, "Chat").hover();
  await expect(page.getByRole("tooltip")).toHaveText("View chat");
});

test("hovering a tab opens only its name, and the tab under the pointer never changes", async ({
  page,
}) => {
  await page.goto("/reviews");
  await hydrated(page);

  const chat = await center(tab(page, "Chat"));
  expect(new Set(await tabsUnder(page, chat))).toEqual(new Set(["chat"]));
  expect(await openNames(page)).toEqual(["Reviews", "Chat"]);

  // On to the next one: Chat stays open while the pointer's on the tabs,
  // since closing it would slide Todo out from under the pointer.
  const todo = await center(tab(page, "Todo"));
  expect(new Set(await tabsUnder(page, todo))).toEqual(new Set(["todo"]));
  expect(await openNames(page)).toEqual(["Reviews", "Chat", "Todo"]);

  // Back to the left: the tabs to its right close, and it doesn't move.
  const schedule = await center(tab(page, "Schedule"));
  expect(new Set(await tabsUnder(page, schedule))).toEqual(
    new Set(["schedule"]),
  );
  expect(await openNames(page)).toEqual(["Schedule", "Reviews"]);

  // Off the tabs, only the product you're on stays named.
  await page.mouse.move(700, 600);
  await expect.poll(() => openNames(page)).toEqual(["Reviews"]);
});

test("switching products from a tab keeps it under the pointer, then the bar settles", async ({
  page,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  const todo = await center(tab(page, "Todo"));
  await page.mouse.move(todo.x, todo.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page).toHaveURL(/\/todo/);
  expect(new Set(await tabsUnder(page, todo))).toEqual(new Set(["todo"]));
  // Reviews stays open while the pointer's on Todo, to its right.
  expect(await openNames(page)).toEqual(["Reviews", "Todo"]);
  await page.mouse.move(700, 600);
  await expect.poll(() => openNames(page)).toEqual(["Todo"]);
});

test("tabbing to a tab opens its name the same way", async ({ page }) => {
  await page.goto("/reviews");
  await hydrated(page);
  // The wordmark, which goes Home.
  await bar(page).locator('a[href="/home"]').first().focus();
  await page.keyboard.press("Tab");
  await expect(tab(page, "Schedule")).toBeFocused();
  await expect.poll(() => openNames(page)).toEqual(["Schedule", "Reviews"]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(tab(page, "Chat")).toBeFocused();
  await expect(tab(page, "Chat")).not.toHaveAttribute("aria-current");
  await expect(tab(page, "Reviews")).toHaveAttribute("aria-current", "page");
  await expect.poll(() => openNames(page)).toEqual(["Reviews", "Chat"]);
});

test("with Reduce Motion, a name opens at once", async ({ page }) => {
  const duration = () =>
    tab(page, "Chat")
      .locator("[data-tab-name]")
      .evaluate((el) => getComputedStyle(el).transitionDuration);
  await page.goto("/reviews");
  await hydrated(page);
  expect(await duration()).not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await duration()).toBe("0s");
  await tab(page, "Chat").hover();
  await expect.poll(() => nameWidth(tab(page, "Chat"))).toBeGreaterThan(0);
  // One look, not a sweep: open is already its full width.
  const open = await nameWidth(tab(page, "Chat"));
  await page.waitForTimeout(300);
  expect(await nameWidth(tab(page, "Chat"))).toBe(open);
});

test("every product's bar ends with the same cluster: Feedback, the bell, Support and the account", async ({
  page,
}) => {
  // Seven bars, at two widths.
  test.setTimeout(150_000);
  await page.goto("/privacy");
  await page.evaluate(async () => {
    await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: `e2ebar${Math.random().toString(36).slice(2, 8)}`,
        return: "/home",
      }),
    });
  });
  for (const [width, paths] of [
    [
      1280,
      [
        "/home",
        "/schedule?demo=1",
        "/reviews",
        "/chat",
        "/plan",
        "/todo",
        "/settings",
      ],
    ],
    [1536, ["/schedule?demo=1", "/plan"]],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      const cluster = bar(page).locator('[data-slot="account-cluster"]');
      await expect(
        cluster.getByRole("button", { name: /^Account: / }),
      ).toBeVisible();
      const names = await cluster
        .locator("button:visible")
        .evaluateAll((els) =>
          els.map(
            (el) =>
              el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
          ),
        );
      expect(names, `${path} at ${width}px`).toEqual([
        "Feedback",
        expect.stringMatching(/^Notifications/),
        "Support Terpsicle",
        expect.stringMatching(/^Account: /),
      ]);
      // The last thing on the bar, whatever the page adds.
      const end = await cluster.evaluate(
        (el) => el.parentElement?.lastElementChild === el,
      );
      expect(end, path).toBe(true);
    }
  }
});
