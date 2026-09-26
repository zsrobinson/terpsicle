import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// The marketing page at `/` (src/features/marketing): the detangle hero, its
// reduced-motion end state, the five live samples, the way into the
// scheduler, and what link previews read. Routing for returning visitors is
// in landing.spec.ts.

const HEADLINE = "Your semester's a tangle of tabs. Let's straighten it out.";
const PRODUCTS = ["Schedule", "Reviews", "Chat", "Plan", "Todo"];

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Waits until every finite animation on the page has finished. */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== "running" ||
            a.effect?.getComputedTiming().iterations ===
              Number.POSITIVE_INFINITY,
        ),
    undefined,
    { timeout: 15_000 },
  );
}

/** The drawing on screen: wide on desktop, tall on a phone. */
function drawing(page: Page): Locator {
  return page.locator("[data-layout]:visible");
}

async function opacities(locator: Locator): Promise<number[]> {
  return locator.evaluateAll((els) =>
    els.map((el) => Number(getComputedStyle(el).opacity)),
  );
}

/** Scrolls a block into view and returns it once its sample has loaded. */
async function block(page: Page, id: string): Promise<Locator> {
  const section = page.locator(`section#${id}`);
  // Again until it sticks: the router puts the page back at the top when it
  // hydrates, which can land after a scroll this early.
  await expect(async () => {
    // The sample itself, which on a phone sits below the block's words.
    await section.locator("[data-preview]").scrollIntoViewIfNeeded();
    await expect(section.getByText(/^Sample/).first()).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  return section;
}

test("the hero straightens into five rails that end in the products", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: HEADLINE }),
  ).toBeVisible();
  await settled(page);
  const figure = drawing(page);
  const ends = figure.getByRole("list", {
    name: "The five parts of Terpsicle",
  });
  await expect(ends.getByRole("link")).toHaveText(
    PRODUCTS.map((p) => new RegExp(`^${p}`)),
  );
  expect(await opacities(figure.locator("[data-rail]"))).toEqual([
    1, 1, 1, 1, 1,
  ]);
  // The moving pieces are gone once it's straight, and the ghost never shows.
  expect(new Set(await opacities(figure.locator(".mk-seg")))).toEqual(
    new Set([0]),
  );
  await expect(figure.locator(".mk-ghost").first()).toBeHidden();
  // Plan and Todo say they're coming, and link only within the page.
  await expect(page.locator("section#plan")).toContainText(
    "Coming this spring",
  );
  await expect(page.locator("section#todo")).toContainText(
    "Coming this spring",
  );
  await expect(
    page.getByRole("link", { name: /^View (plan|todos?)/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Replay" }).click();
  // Replaying draws it tangled again, then straightens it.
  expect(Math.max(...(await opacities(drawing(page).locator(".mk-seg"))))).toBe(
    1,
  );
  await settled(page);
  expect(await opacities(drawing(page).locator("[data-rail]"))).toEqual([
    1, 1, 1, 1, 1,
  ]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the hero is straight at once, over a ghost of the tangle", async ({
    page,
  }) => {
    await page.goto("/");
    const figure = drawing(page);
    // No waiting: nothing moves.
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    ).toBe(0);
    expect(await opacities(figure.locator("[data-rail]"))).toEqual([
      1, 1, 1, 1, 1,
    ]);
    await expect(figure.locator(".mk-ghost")).toHaveCount(5);
    await expect(figure.locator(".mk-ghost").first()).toBeVisible();
    await expect(figure.getByRole("link", { name: /^Schedule/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Replay" })).toBeHidden();
  });

  test("the samples work, from the keyboard too", async ({ page }) => {
    await page.goto("/");

    const schedule = await block(page, "schedule");
    const add = schedule.getByRole("button", { name: "Add STAT400 0101" });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(schedule.getByText("2 problems")).toBeVisible();
    await schedule.getByRole("button", { name: "Switch to 0301" }).click();
    await expect(schedule.getByText("1 problem")).toBeVisible();

    const reviews = await block(page, "reviews");
    const whitfield = reviews.getByRole("button", { name: "J. Whitfield" });
    await whitfield.focus();
    await page.keyboard.press("Space");
    await expect(whitfield).toHaveAttribute("aria-pressed", "true");
    await expect(
      reviews.getByText(/Knows the material deeply/).first(),
    ).toBeAttached();

    const chat = await block(page, "chat");
    const messages = chat.getByRole("list", { name: "Messages in CMSC351" });
    await expect(messages.getByRole("listitem")).toHaveCount(3);
    await chat.getByRole("textbox", { name: "Message CMSC351" }).fill("Room?");
    await page.keyboard.press("Enter");
    await expect(messages.getByText("Room?")).toBeVisible();
    await expect(
      messages.getByText("Sounds good, see you there."),
    ).toBeVisible();

    const plan = await block(page, "plan");
    await plan.getByRole("combobox", { name: "to" }).selectOption("s28");
    await plan.getByRole("button", { name: "Move", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      plan.getByRole("region", { name: "Spring 2028" }).getByText("ARTT100"),
    ).toBeVisible();
    await expect(
      plan.getByRole("img", { name: /^Scholarship in Practice/ }),
    ).toHaveAccessibleName(
      "Scholarship in Practice: 0 done, 1 planned, 2 needed",
    );

    const todo = await block(page, "todo");
    const lab = todo.getByRole("checkbox", { name: /Lab 4 report/ });
    await lab.focus();
    await page.keyboard.press("Space");
    await expect(lab).toBeChecked();
    await expect(todo.getByText("5 open", { exact: true })).toBeVisible();
  });
});

test("chat messages arrive one at a time", async ({ page }) => {
  await page.goto("/");
  const chat = await block(page, "chat");
  const messages = chat.getByRole("list", { name: "Messages in CMSC351" });
  await expect(messages.getByText(/^Is the Thursday discussion/)).toBeVisible();
  // The first is in and the last isn't yet: they come one at a time.
  await expect(messages.getByText(/^Midterm study group/)).toHaveCount(0);
  await expect(messages.getByText(/^Midterm study group/)).toBeVisible({
    timeout: 10_000,
  });
});

test("Open the scheduler goes to the scheduler; sign-in is a plain link", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in with Google" }),
  ).toHaveAttribute("href", "/signin");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" }),
  ).toHaveAttribute("href", "/signin");
  await page.getByRole("link", { name: "Open the scheduler" }).click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(
    page.getByRole("region", { name: "Week calendar" }),
  ).toBeVisible();
});

test("tells search engines and link previews what it is", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Terpsicle: planning tools for your semester at Maryland",
  );
  const meta = (attr: string, value: string) =>
    page.locator(`head meta[${attr}="${value}"]`);
  await expect(meta("name", "description")).toHaveCount(1);
  await expect(meta("name", "description")).toHaveAttribute(
    "content",
    /UMD class schedule/,
  );
  for (const property of ["og:title", "og:description", "og:image", "og:url"])
    await expect(meta("property", property), property).toHaveCount(1);
  await expect(meta("property", "og:image")).toHaveAttribute(
    "content",
    "https://terpsicle.com/og.png",
  );
  const image = await page.request.get("/og.png");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("the footer credits the data, disclaims UMD, and builds the address only on click", async ({
  page,
  request,
}) => {
  const address = ["admin", "terpsicle.com"].join("@");
  const html = await (await request.get("/")).text();
  expect(html).not.toContain(address);
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
  await expect(footer).toContainText("Course data from Testudo.");
  await expect(footer).toContainText(
    "Not affiliated with the University of Maryland.",
  );
  // The contact loads as the footer nears: in words, with a button.
  await expect(async () => {
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.getByText("admin [at] terpsicle.com")).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 15_000 });
  await expect(footer.getByRole("button", { name: "Email us" })).toBeVisible();
  expect(await page.content()).not.toContain(address);
});

test("shows the paper grain, and fits a phone without sideways scrolling", async ({
  page,
}) => {
  await page.goto("/");
  const fill = await page
    .locator("[data-marketing]")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(fill).toBe("rgba(0, 0, 0, 0)");
  expect(
    await page.evaluate(
      () => getComputedStyle(document.body, "::before").backgroundImage,
    ),
  ).toContain("svg");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const scheme of ["light", "dark"] as const) {
  test(`passes axe in ${scheme}, samples and all`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    for (const id of ["schedule", "reviews", "chat", "plan", "todo"])
      await block(page, id);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settled(page);
    const { violations } = await new AxeBuilder({ page })
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
        "best-practice",
      ])
      // Tooltips portal to the end of <body>, outside the landmarks.
      .exclude("[data-radix-popper-content-wrapper]")
      .analyze();
    expect(
      violations.map((v) => ({
        rule: v.id,
        nodes: v.nodes.slice(0, 4).map((n) => n.target.join(" ")),
      })),
    ).toEqual([]);
  });
}
