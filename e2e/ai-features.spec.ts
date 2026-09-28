import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { scan } from "./axe";
import { liveToasts } from "./toasts";

// "Show AI summaries" end to end (docs/decisions.md, "AI features can be
// turned off"), on `pnpm dev:mock`. Mock mode has no Workers AI, so the
// review summary comes from a stand-in answer to /api/review-summary; the
// test counts those requests to check nothing is asked while it's off.
//
// Keiko Ashdown ("ashdown_keiko") teaches CMSC351 in the mock term, with 142
// PlanetTerp reviews.

const INSTRUCTOR = "/reviews/ashdown-keiko?course=CMSC351";
const SUMMARY =
  "Students say the lectures are clear and the exams are fair, but the problem sets take a long time.";

let errors: string[] = [];
const contexts: BrowserContext[] = [];

test.beforeEach(() => {
  errors = [];
});

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(errors).toEqual([]);
});

/** A fresh browser profile, as another device has, with a stand-in model. */
async function device(browser: Browser, baseURL?: string) {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const asked = { count: 0 };
  await page.route("**/api/review-summary", async (route) => {
    asked.count += 1;
    const { slug } = route.request().postDataJSON() as { slug: string };
    await route.fulfill({
      json: {
        status: "ok",
        summary: {
          schemaVersion: 1,
          slug,
          summary: SUMMARY,
          themes: [
            { label: "clear lectures", sentiment: "positive" },
            { label: "long problem sets", sentiment: "negative" },
          ],
          basedOnReviewCount: 142,
          latestReviewAt: null,
          generatedAt: "2026-09-01T12:00:00.000Z",
          model: "stand-in",
        },
      },
    });
  });
  return { page, asked };
}

const summary = (page: Page) => page.getByText(SUMMARY);
const menuButton = (page: Page) =>
  page.getByRole("button", { name: "AI summary options" });
const aiSwitch = (page: Page) =>
  page.getByRole("switch", { name: "Show AI summaries" });

async function hideFromTheBox(page: Page) {
  await menuButton(page).click();
  await page.getByRole("menuitem", { name: /Hide AI summaries/ }).click();
  await expect(summary(page)).toBeHidden();
  await expect(menuButton(page)).toBeHidden();
}

test("hides AI summaries from the box, Settings shows it, and turns them back on", async ({
  browser,
  baseURL,
}) => {
  const { page, asked } = await device(browser, baseURL);
  await page.goto(INSTRUCTOR);
  await expect(summary(page)).toBeVisible();
  await expect(page.getByText("clear lectures")).toBeVisible();
  await scan(page, "the AI summary box");
  await menuButton(page).click();
  await expect(
    page.getByRole("menuitem", { name: /Hide AI summaries/ }),
  ).toBeVisible();
  await scan(page, "the AI summary box's menu");
  await page.keyboard.press("Escape");

  await hideFromTheBox(page);
  const toast = liveToasts(page).filter({ hasText: "AI summaries are off" });
  await expect(toast).toContainText("Turn them back on in Settings.");
  // Undo brings them back at once.
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(summary(page)).toBeVisible();

  await hideFromTheBox(page);
  // Nothing is asked of the model while they're off, even on a fresh load.
  const before = asked.count;
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
  await expect(summary(page)).toBeHidden();
  expect(asked.count).toBe(before);

  // Settings says so, signed out too, and turns them back on.
  await page.goto("/settings");
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  await expect(aiSwitch(page)).not.toBeChecked();
  await scan(page, "Settings, AI features off");
  await aiSwitch(page).click();
  await expect(aiSwitch(page)).toBeChecked();

  await page.goto(INSTRUCTOR);
  await expect(summary(page)).toBeVisible();
});

test("the choice follows the account to another device", async ({
  browser,
  baseURL,
  isMobile,
}) => {
  test.skip(isMobile, "two devices, desktop interactions");
  const user = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const signIn = async (page: Page, path: string) => {
    await page.goto("/settings");
    const next = await page.evaluate(
      async ({ id, path }) => {
        const response = await fetch("/api/auth/test-sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, return: path }),
        });
        const result: { return?: string } = await response.json();
        return result.return ?? "";
      },
      { id: user, path },
    );
    await page.goto(next);
    await expect(
      page.getByRole("banner").getByRole("button", { name: /^Account:/ }),
    ).toBeVisible();
  };

  const laptop = await device(browser, baseURL);
  await signIn(laptop.page, INSTRUCTOR);
  await expect(summary(laptop.page)).toBeVisible();
  await hideFromTheBox(laptop.page);
  // Saved to the account: the laptop's Settings says it follows it.
  await laptop.page.goto("/settings");
  await expect(laptop.page.getByText("Follows your account")).toBeVisible();
  await expect(aiSwitch(laptop.page)).not.toBeChecked();

  const phone = await device(browser, baseURL);
  await signIn(phone.page, "/settings");
  await expect(aiSwitch(phone.page)).not.toBeChecked({ timeout: 15_000 });
  await phone.page.goto(INSTRUCTOR);
  await expect(
    phone.page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  await expect(summary(phone.page)).toBeHidden();
  expect(phone.asked.count).toBe(0);

  // Back on from the phone: the laptop follows.
  await phone.page.goto("/settings");
  await aiSwitch(phone.page).click();
  await expect(aiSwitch(phone.page)).toBeChecked();
  // On the account: the phone pushes it a second after the change.
  await expect
    .poll(() => accountAiFeatures(phone.page), { timeout: 15_000 })
    .toBe(true);
  // The laptop's next page pulls it once it has hydrated, asked /api/me and
  // loaded sync: about 3.5 s after the navigation on CI's dev server. So
  // one visit, and wait for that pull. Reloading every 3 s threw each pull
  // away just before it landed.
  await laptop.page.goto(INSTRUCTOR);
  await expect(summary(laptop.page)).toBeVisible({ timeout: 15_000 });
});

/** The account's "Show AI summaries", as its settings doc holds it. */
function accountAiFeatures(page: Page): Promise<boolean | undefined> {
  return page.evaluate(async () => {
    const response = await fetch("/api/sync/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since: 0 }),
    });
    const pulled: {
      docs: {
        kind: string;
        body: { prefs?: { ai?: { features?: boolean } } };
      }[];
    } = await response.json();
    return pulled.docs.find((d) => d.kind === "settings")?.body.prefs?.ai
      ?.features;
  });
}
