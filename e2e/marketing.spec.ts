import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The marketing page at `/` (src/features/marketing): the hero over the
// plain week, the screen that stays while the steps scroll past and what
// each step puts on it, the demos from the keyboard, what search engines
// and link previews read, robots and the sitemap, and axe in both themes.
// Routing for returning visitors is in landing.spec.ts.

const HEADLINE = "Plan the semester in five steps, in one place.";
const TITLE =
  "Terpsicle: the UMD class scheduler, with reviews, chats and more";
const PRODUCTS = ["Schedule", "Reviews", "Chat", "Plan", "Todo"];

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Waits until the page has hydrated: the demos answer from then on. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-marketing="ready"]')).toBeAttached({
    timeout: 20_000,
  });
}

/** The screen's stage, from its data attribute. */
const stageOf = (page: Page) => page.locator(".mk-screen");

/** Scrolls step `n`'s words to where the page stages them. */
async function scrollToStep(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-step="${n}"]`);
    if (!el) throw new Error(`No step ${n}`);
    const r = el.getBoundingClientRect();
    const wide = window.innerWidth >= 1024;
    window.scrollTo({
      top: wide
        ? window.scrollY + r.top + r.height / 2 - window.innerHeight / 2
        : window.scrollY + r.top - window.innerHeight * 0.55 + 20,
      behavior: "instant",
    });
  }, n);
}

test("the hero shows the plain week, and each step puts its product on it as it scrolls by", async ({
  page,
}) => {
  await page.goto("/?stay");
  await expect(
    page.getByRole("heading", { level: 1, name: HEADLINE }),
  ).toBeVisible();
  // Above the fold: the week, and nothing on it yet.
  const week = page.locator("[data-week]");
  await expect(week).toBeInViewport();
  await expect(week).toHaveAttribute("aria-label", /^Plan A's week: CMSC351/);
  await expect(stageOf(page)).toHaveAttribute("data-stage", "0");
  await ready(page);

  const steps = page.getByRole("navigation", { name: "Steps" });
  await expect(steps.getByRole("button")).toHaveText(PRODUCTS);
  const pieces = ["problems", "reviews", "chat", "plan", "todo"];
  for (let n = 1; n <= 5; n++) {
    await scrollToStep(page, n);
    await expect(stageOf(page)).toHaveAttribute("data-stage", String(n));
    await expect(
      steps.getByRole("button", { name: PRODUCTS[n - 1] }),
    ).toHaveAttribute("aria-pressed", "true");
    // The screen stays in view while the words scroll.
    await expect(week).toBeInViewport({ ratio: 0.3 });
    await expect(
      page.locator(`[data-piece="${pieces[n - 1]}"]`),
    ).toHaveAttribute("data-on", "");
  }
  // Back up: the pieces leave again.
  await scrollToStep(page, 2);
  await expect(stageOf(page)).toHaveAttribute("data-stage", "2");
  await expect(page.locator('[data-piece="todo"]')).not.toHaveAttribute(
    "data-on",
  );
  // Every link goes where it says.
  await expect(
    page.getByRole("link", { name: "View todos" }).first(),
  ).toHaveAttribute("href", "/todo");
  await expect(
    page.getByRole("link", { name: "View four-year plan" }).first(),
  ).toHaveAttribute("href", "/plan");
});

test("the page never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?stay");
  await ready(page);
  for (const n of [0, 1, 3, 5]) {
    await scrollToStep(page, n);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the demos work from the keyboard, with nothing animating", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/?stay");
    await ready(page);
    const steps = page.getByRole("navigation", { name: "Steps" });

    // Schedule: the Problems tab. The walking conflict first.
    await steps.getByRole("button", { name: "Schedule" }).focus();
    await page.keyboard.press("Enter");
    const walk = page.getByRole("button", { name: "Switch STAT400 to 0201" });
    await walk.focus();
    await page.keyboard.press("Enter");
    await expect(walk).toHaveCount(0);
    await expect(page.locator("[data-week] .mk-pill")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Plan A has 2 problems" }),
    ).toBeVisible();
    await expect(page.getByText("Switched STAT400 to 0201")).toBeVisible();
    // Undo puts it back.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(
      page.getByRole("button", { name: "Plan A has 3 problems" }),
    ).toBeVisible();
    await expect(page.locator("[data-week] .mk-pill")).toHaveCount(3);

    // The seat watch.
    const watch = page.getByRole("button", {
      name: "Watch CMSC351 0301 for a seat",
    });
    await watch.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Watching CMSC351 0301" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Chat: send a message.
    await steps.getByRole("button", { name: "Chat" }).click();
    const box = page.getByRole("textbox", { name: "Message CMSC351 0301" });
    await box.fill("Room?");
    await box.press("Enter");
    const log = page.getByRole("list", { name: "Messages in CMSC351 0301" });
    await expect(log.getByText("Room?")).toBeVisible();
    await expect(log.getByText("Sounds good, see you there.")).toBeVisible();

    // Todo: check one off.
    await steps.getByRole("button", { name: "Todo" }).click();
    const hw = page.getByRole("checkbox", { name: "Done: Homework 4" });
    await hw.focus();
    await page.keyboard.press("Space");
    await expect(hw).toBeChecked();

    // Start over puts the sample back (under the screen on a desktop; a
    // phone's screen has no room for it, and Undo is there).
    await steps.getByRole("button", { name: "Schedule" }).click();
    if (!isMobile) {
      await page.getByRole("button", { name: "Start over" }).click();
      await expect(
        page.getByRole("button", { name: "Watch CMSC351 0301 for a seat" }),
      ).toBeVisible();
    }

    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    ).toBe(0);
  });
});

test("View schedule goes to the scheduler; sign-in is a plain link", async ({
  page,
}) => {
  await page.goto("/?stay");
  await ready(page);
  await expect(
    page.getByRole("main").getByRole("link", { name: "Sign in with UMD" }),
  ).toHaveAttribute("href", "/signin");
  await page
    .getByRole("main")
    .getByRole("link", { name: "View schedule" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(
    page.getByRole("region", { name: "Week calendar" }),
  ).toBeVisible();
});

test("what search engines and link previews read", async ({
  page,
  request,
}) => {
  // React escapes apostrophes in text; read them back.
  const html = (await (await request.get("/?stay")).text()).replace(
    /&#x27;/g,
    "'",
  );
  // Server-rendered: the headline, every step's words and the week.
  expect(html).toContain(HEADLINE);
  for (const id of ["schedule", "reviews", "chat", "plan", "todo"])
    expect(html).toContain(`id="${id}"`);
  expect(html).toContain("Build the week, and let it check itself.");
  expect(html).toContain("Plan A's week: CMSC351 0301");
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  // The contact address never appears whole.
  expect(html).not.toContain(["admin", "terpsicle.com"].join("@"));

  await page.goto("/?stay");
  await expect(page).toHaveTitle(TITLE);
  const meta = (selector: string) =>
    page.locator(`head ${selector}`).getAttribute("content");
  expect(await meta('meta[name="description"]')).toMatch(/UMD class schedule/);
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://terpsicle.com/",
  );
  expect(await meta('meta[property="og:title"]')).toBe(TITLE);
  expect(await meta('meta[property="og:image"]')).toBe(
    "https://terpsicle.com/og.png",
  );
  expect(await meta('meta[property="og:image:width"]')).toBe("1200");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  const ld = JSON.parse(
    (await page
      .locator('head script[type="application/ld+json"]')
      .textContent()) ?? "{}",
  ) as { "@graph": { "@type": string; url: string }[] };
  expect(ld["@graph"].map((n) => n["@type"])).toEqual([
    "WebSite",
    "Organization",
    "WebApplication",
  ]);
  // The headline's font and the week's mono face are preloaded.
  const preloads = await page
    .locator('head link[rel="preload"][as="font"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  expect(preloads.some((h) => /bricolage-grotesque-latin-opsz/.test(h))).toBe(
    true,
  );
  expect(preloads.some((h) => /geist-mono-latin-wght/.test(h))).toBe(true);
  const og = await request.get("/og.png");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
});

test("robots.txt and the sitemap", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.headers()["content-type"]).toContain("text/plain");
  // Not production: nothing here should be indexed.
  expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const xml = await sitemap.text();
  for (const path of ["/", "/schedule", "/reviews", "/privacy"])
    expect(xml).toContain(`<loc>https://terpsicle.com${path}</loc>`);
});

for (const theme of ["light", "dark"] as const) {
  test(`is accessible in ${theme}, at every stage`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/?stay");
    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(
      theme === "dark" ? /dark/ : /^$/,
    );
    await ready(page);
    await scan(page, `marketing, ${theme}`);
    // Each step's tint and each piece, as they land.
    for (const n of [1, 3, 5]) {
      await scrollToStep(page, n);
      await expect(stageOf(page)).toHaveAttribute("data-stage", String(n));
      await scan(page, `marketing step ${n}, ${theme}`);
    }
  });
}
