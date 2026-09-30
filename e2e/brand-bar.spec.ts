import { expect, type Page, test } from "@playwright/test";

// The family bar's brand pieces (the owner, 2026-09-28): the "Early access"
// chip and its note, the coffee button, "Support Terpsicle", in the account
// cluster (a link in the account menu on phones), the ink monogram, and `/`'s header, which never
// says "Sign in" to someone who's signed in.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bar = (page: Page) => page.locator('[data-slot="app-bar"]');
const NOTE = "Terpsicle's still in active development, so things may change.";

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    bar(page).getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
}

async function signIn(page: Page, path: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"));
}

test("the bar says Early access, and the product menu says why", async ({
  page,
  isMobile,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  const chip = bar(page).getByTestId("early-access").filter({ visible: true });
  if (!isMobile) await page.setViewportSize({ width: 1600, height: 900 });
  if (isMobile) {
    // A phone's bar keeps the room, and the tab bar has the product menu's
    // place: the account menu says it.
    await expect(chip).toHaveCount(0);
    await bar(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("menu").getByText(NOTE)).toBeVisible();
  } else {
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("Early access");
    await chip.hover();
    await expect(page.getByRole("tooltip")).toContainText(NOTE);
  }
});

test("the coffee button opens its note and links out", async ({
  page,
  isMobile,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  let link = page.getByRole("link", { name: "Buy Terpsicle a coffee" });
  if (isMobile) {
    // A phone's bar keeps its title and the account: coffee is in the
    // account menu, with Feedback.
    await expect(page.getByTestId("coffee-button")).toHaveCount(0);
    await expect(page.getByTestId("feedback-button")).toHaveCount(0);
    await bar(page).getByRole("button", { name: "Sign in" }).click();
    link = page.getByRole("menuitem", { name: "Buy Terpsicle a coffee" });
  } else {
    const button = page.getByTestId("coffee-button");
    await expect(button).toHaveAccessibleName("Support Terpsicle");
    await button.click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(
          "Does Terpsicle help you out? A coffee helps keep it running and growing.",
        ),
    ).toBeVisible();
  }
  await expect(link).toHaveAttribute(
    "href",
    "https://buymeacoffee.com/zsrobinson",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("below 1536px no bar shows the chip, so the product tabs sit in the same place on every product", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the phone bar folds the tabs into the product menu");
  const tabsLeft = async () => {
    const box = await bar(page)
      .getByRole("navigation", { name: "Products" })
      .boundingBox();
    return box?.x;
  };
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const lefts: (number | undefined)[] = [];
    for (const path of ["/schedule?demo=1", "/reviews", "/plan", "/todo"]) {
      await page.goto(path);
      await hydrated(page);
      await expect(
        bar(page).getByTestId("early-access").filter({ visible: true }),
      ).toHaveCount(0);
      lefts.push(await tabsLeft());
    }
    expect(new Set(lefts).size, `tabs at ${width}px: ${lefts}`).toBe(1);
  }
  // From 1536px the chip's back beside the wordmark, on every bar alike.
  await page.setViewportSize({ width: 1600, height: 900 });
  const lefts: (number | undefined)[] = [];
  for (const path of ["/schedule?demo=1", "/reviews"]) {
    await page.goto(path);
    await hydrated(page);
    await expect(
      bar(page).getByTestId("early-access").filter({ visible: true }),
    ).toHaveCount(1);
    lefts.push(await tabsLeft());
  }
  expect(new Set(lefts).size, `tabs at 1600px: ${lefts}`).toBe(1);
});

test("the scheduler's bar keeps Support and Feedback's label at every desktop width, so its menu doesn't repeat them", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the phone bar has its own rule");
  // The product tabs fold to their marks, which gives the room back (the
  // owner, 2026-09-30): the account cluster is the same on every bar.
  await page.goto("/schedule?demo=1");
  await hydrated(page);
  for (const width of [1280, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId("coffee-button")).toBeVisible();
    await expect(page.getByTestId("feedback-button")).toHaveText("Feedback");
    await expect(
      bar(page).getByTestId("early-access").filter({ visible: true }),
    ).toHaveCount(width >= 1536 ? 1 : 0);
  }
  await bar(page).getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Buy Terpsicle a coffee" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "Send feedback" }),
  ).toHaveCount(0);
});

test("signed in, / offers the account and the way back, never Sign in", async ({
  page,
}) => {
  await page.goto("/?stay");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();

  await signIn(page, "/?stay");
  await expect(
    header.getByRole("link", { name: "Open Terpsicle" }),
  ).toBeVisible();
  await expect(
    header.getByRole("button", { name: "Account: Test Student" }),
  ).toBeVisible();
  await expect(header.getByText("Sign in", { exact: true })).toHaveCount(0);
});

test("the monogram is ink: black in light, paper in dark", async ({ page }) => {
  await signIn(page, "/reviews");
  const monogram = bar(page)
    .getByRole("button", { name: /^Account: / })
    .locator("span", { hasText: /^TS$/ });
  await expect(monogram).toBeVisible();
  const colors = () =>
    monogram.evaluate((el) => {
      const style = getComputedStyle(el);
      return { bg: style.backgroundColor, fg: style.color };
    });
  expect(await colors()).toEqual({
    bg: "rgb(16, 15, 15)",
    fg: "rgb(255, 252, 240)",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(colors)
    .toEqual({ bg: "rgb(255, 252, 240)", fg: "rgb(16, 15, 15)" });
});

test("every phone bar leads with a title, at rest", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phones only");
  // The left side is never empty (docs/DESIGN.md §7.8): the product's
  // context where it has one, the product's name otherwise, before any
  // scroll.
  const leading = () =>
    bar(page).evaluate((el) => {
      const half = el.getBoundingClientRect().width / 2;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const words: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? "";
        if (!text || !n.parentElement) continue;
        const style = getComputedStyle(n.parentElement);
        if (style.visibility === "hidden" || Number(style.opacity) === 0)
          continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const box = range.getBoundingClientRect();
        if (box.width > 0 && box.left < half) words.push(text);
      }
      return words.join(" ");
    });
  for (const path of [
    "/home",
    "/schedule?demo=1",
    "/reviews",
    "/chat",
    "/plan",
    "/todo",
    "/settings",
  ]) {
    await page.goto(path);
    await expect.poll(leading, { message: path }).not.toBe("");
  }
  await page.goto("/reviews/cmsc131");
  await expect(bar(page).locator("[data-phone-title]")).toHaveText("CMSC131");
});
