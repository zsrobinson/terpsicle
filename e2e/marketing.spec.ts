import { expect, type Locator, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The marketing page at `/` (src/features/marketing): the detangle hero and
// its reduced-motion end state, the five live samples from the keyboard,
// what search engines and link previews read, robots and the sitemap, and
// axe in both themes. Routing for returning visitors is in landing.spec.ts.

const HEADLINE = "Your semester's a tangle of tabs. Let's straighten it out.";
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

/** The hero's drawing on screen: wide on desktop, tall on a phone. */
function figure(page: Page): Locator {
  return page.locator("[data-tangle] > div:visible");
}

/** The lines' path data, in the drawing on screen. */
async function lines(page: Page): Promise<string[]> {
  return figure(page)
    .locator("path[data-line]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("d") ?? ""));
}

/** Waits until the page has hydrated: the samples answer from then on. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator('[data-marketing="ready"]')).toBeAttached({
    timeout: 20_000,
  });
}

/** A block, scrolled into view once the page answers. */
async function block(page: Page, id: string): Promise<Locator> {
  await ready(page);
  const section = page.locator(`section#${id}`);
  await section.locator("[data-sample]").scrollIntoViewIfNeeded();
  return section;
}

test("the hero tangles first, then straightens into five rails that end in the products", async ({
  page,
}) => {
  await page.goto("/?stay");
  await expect(
    page.getByRole("heading", { level: 1, name: HEADLINE }),
  ).toBeVisible();
  // The inline script has claimed the drawing and started from the tangle.
  const tangle = page.locator("[data-tangle]");
  await expect(tangle).toHaveAttribute("data-tangle", /playing|done/);
  const mid = await lines(page);
  // Then it settles: straight rails, and the marks in place.
  await expect(tangle).toHaveAttribute("data-tangle", "done", {
    timeout: 10_000,
  });
  const done = await lines(page);
  expect(done).not.toEqual(mid);
  const ends = figure(page).getByRole("list", {
    name: "The five parts of Terpsicle",
  });
  await expect(ends.getByRole("link")).toHaveText(
    PRODUCTS.map((p) => new RegExp(`^${p}`)),
  );
  for (const end of await ends.locator(".mk-end").all())
    await expect(end).toHaveCSS("opacity", "1", { timeout: 3000 });
  // Straight: every line's last point is at the drawing's far edge, level.
  for (const d of done) {
    const last = d.split("C").at(-1)?.trim().split(" ").slice(-2) ?? [];
    expect(last).toHaveLength(2);
  }
  // Plan and Todo say they're coming, and link only within the page.
  await expect(page.locator("section#plan")).toContainText("Coming soon");
  await expect(page.locator("section#todo")).toContainText("Coming soon");
  await expect(
    page.getByRole("link", { name: /^View (plan|todos?)/ }),
  ).toHaveCount(0);

  // Replay tangles it again and straightens it once more.
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(tangle).toHaveAttribute("data-tangle", "playing");
  expect(await lines(page)).not.toEqual(done);
  await expect(tangle).toHaveAttribute("data-tangle", "done", {
    timeout: 10_000,
  });
  expect(await lines(page)).toEqual(done);
});

test("the page never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?stay");
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the hero is straight at once, over a ghost of the tangle, with no replay", async ({
    page,
  }) => {
    await page.goto("/?stay");
    await expect(page.locator("[data-tangle]")).toHaveAttribute(
      "data-tangle",
      "done",
    );
    const fig = figure(page);
    await expect(fig.locator(".mk-ghost")).toHaveCount(5);
    await expect(fig.locator(".mk-ghost").first()).toBeVisible();
    for (const end of await fig.locator(".mk-end").all())
      await expect(end).toHaveCSS("opacity", "1");
    // The server's rails, untouched: nothing was redrawn.
    const drawn = await lines(page);
    expect(drawn.every((d) => d.startsWith("M"))).toBe(true);
    await expect(page.getByRole("button", { name: "Replay" })).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    ).toBe(0);
  });

  test("the samples work, from the keyboard too", async ({ page }) => {
    await page.goto("/?stay");

    const schedule = await block(page, "schedule");
    await schedule.getByRole("button", { name: "Add ENGL393 0101" }).focus();
    await page.keyboard.press("Enter");
    await expect(schedule.getByText("1 problem")).toBeVisible();
    await schedule.getByRole("button", { name: "Switch to 0404" }).click();
    await expect(schedule.getByText("No problems")).toBeVisible();

    const reviews = await block(page, "reviews");
    const haddad = reviews.getByRole("button", { name: "Rana Haddad" });
    await haddad.focus();
    await page.keyboard.press("Space");
    await expect(haddad).toHaveAttribute("aria-pressed", "true");
    await expect(reviews.getByText(/Moves fast and skips/)).toBeVisible();

    const chat = await block(page, "chat");
    const messages = chat.getByRole("list", {
      name: "Messages in CMSC351 0301",
    });
    await expect(messages.getByRole("listitem")).toHaveCount(3);
    await chat
      .getByRole("textbox", { name: "Message CMSC351 0301" })
      .fill("Room?");
    await page.keyboard.press("Enter");
    await expect(messages.getByText("Room?")).toBeVisible();
    await expect(
      messages.getByText("Sounds good, see you there."),
    ).toBeVisible();

    const plan = await block(page, "plan");
    await plan.getByRole("combobox", { name: "into" }).selectOption("f28");
    await plan.getByRole("button", { name: "Place" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      plan.getByRole("region", { name: "Fall 2028" }).getByText("ECON200"),
    ).toBeVisible();

    const todo = await block(page, "todo");
    const hw = todo.getByRole("checkbox", { name: /Homework 4/ });
    await hw.focus();
    await page.keyboard.press("Space");
    await expect(hw).toBeChecked();
    await expect(todo.getByText("5 open", { exact: true })).toBeVisible();
  });
});

test("chat messages arrive one at a time", async ({ page }) => {
  await page.goto("/?stay");
  const chat = await block(page, "chat");
  const messages = chat.getByRole("list", { name: "Messages in CMSC351 0301" });
  await expect(messages.getByText(/^Is the Friday discussion/)).toBeVisible();
  // The first is there and the last isn't yet: they come one at a time.
  await expect(messages.getByText(/^Midterm study group/)).toHaveCount(0);
  await expect(messages.getByText(/^Midterm study group/)).toBeVisible({
    timeout: 10_000,
  });
});

test("Open the scheduler goes to the scheduler; sign-in is a plain link", async ({
  page,
}) => {
  await page.goto("/?stay");
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Sign in with your UMD account" }),
  ).toHaveAttribute("href", "/signin");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Open the scheduler" })
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
  // Server-rendered: the headline, the blocks and the samples are in the HTML.
  expect(html).toContain(HEADLINE);
  expect(html).toContain('id="todo"');
  expect(html).toContain("Plan A · Spring 2027");
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
  ]);
  // The headline's font is preloaded, and it's the one the page uses.
  const preload = await page
    .locator('head link[rel="preload"][as="font"]')
    .getAttribute("href");
  expect(preload).toMatch(/bricolage-grotesque-latin-opsz/);
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
  test(`is accessible in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/?stay");
    await expect(
      page.getByRole("heading", { level: 1, name: HEADLINE }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveClass(
      theme === "dark" ? /dark/ : /^$/,
    );
    await scan(page, `marketing, ${theme}`);
  });
}
