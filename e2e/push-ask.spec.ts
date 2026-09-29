import { expect, type Page, type TestInfo, test } from "@playwright/test";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";
import { scan } from "./axe";
import { liveToasts } from "./toasts";

// Asking to turn on notifications at the moment (V2.md §6.7, "Asking") on
// `pnpm dev:mock`: the card in our words after a first Chat post and after
// connecting ELMS, "Not now" remembered, Turn on handing off to the
// browser's prompt, and the iPhone Home Screen app's first-launch step, by
// a mocked user agent as e2e/pwa.spec.ts does. Each test signs in as a new
// person, so none shares a feed, a room's state or a device's answers.

// Full Chromium, not Playwright's default headless binary
// (chromium-headless-shell, what CI runs): the shell has no notifications,
// and its permission reads "denied" from the start, so nothing would ever
// ask (as e2e/pwa-push.spec.ts). `channel` forces its own worker, so this
// file keeps to the asks.
test.use({ channel: "chromium" });

const TERM = "202701";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Signs in as a new test-mode person, on `path`. */
async function signInNew(page: Page, path: string) {
  await page.goto(path);
  const status = await page.evaluate(async (path) => {
    const id = `e2e${Math.random().toString(36).slice(2, 12)}`;
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: path }),
    });
    return ((await response.json()) as { status: string }).status;
  }, path);
  expect(status).toBe("signed-in");
  await page.reload();
}

/** Each project has its own course, so the two never share a room. */
const courseFor = (info: TestInfo) =>
  info.project.name === "mobile" ? "CMSC330" : "CMSC351";

/** A plan with the course's section 0101, as the sync engine saves it. */
async function syncPlan(page: Page, course: string) {
  const now = new Date().toISOString();
  const id = `plan_e2e_ask_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/sync/push", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Sec-Fetch-Site": "same-origin",
    },
    data: {
      docs: [
        {
          kind: "plan",
          id,
          baseRev: 0,
          body: {
            id,
            termId: TERM,
            name: "Plan A",
            order: -Date.now(),
            createdAt: now,
            updatedAt: now,
            courses: [
              {
                courseCode: course,
                sectionCode: "0101",
                snapshot: { instructors: [], delivery: "f2f", meetings: [] },
              },
            ],
          },
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

const askCard = (page: Page, name: string) =>
  page.getByRole("region", { name });

test("asks after your first Chat post, above the composer, and remembers Not now", async ({
  page,
}, info) => {
  test.slow();
  const course = courseFor(info);
  await signInNew(page, "/chat");
  await syncPlan(page, course);
  await page.goto(`/chat?term=${TERM}&course=${course}&room=${TERM}:${course}`);
  await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  // Someone new sees "Posting here" over the composer; their first post
  // closes it, and that's when the ask comes, in the same place.
  const postingHere = page.getByRole("region", { name: "Posting here" });
  await expect(postingHere).toBeVisible();

  // Nothing asks on the way in: only once you've posted.
  const card = askCard(page, "Hear back when someone answers?");
  await expect(card).toHaveCount(0);
  const field = page.getByRole("textbox", { name: /^Message/ });
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  await field.fill(`anyone studying for the midterm? ${tag}`);
  await field.press("Enter");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(postingHere).toHaveCount(0);
  await expect(card).toContainText(
    "Get a notification when a classmate mentions you or replies to you.",
  );
  // Right above the composer, where the post came from.
  const cardBox = await card.boundingBox();
  const fieldBox = await field.boundingBox();
  expect(cardBox && fieldBox && cardBox.y < fieldBox.y).toBe(true);
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `the Chat ask (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });

  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);

  // Another post, and a new tab: not again.
  await field.fill(`see you there ${tag}`);
  await field.press("Enter");
  const next = await page.context().newPage();
  await next.goto(page.url());
  await expect(next.getByRole("log", { name: "Messages" })).toBeVisible();
  const nextField = next.getByRole("textbox", { name: /^Message/ });
  await nextField.fill(`one more ${tag}`);
  await nextField.press("Enter");
  await expect(next.getByText(`one more ${tag}`)).toBeVisible({
    timeout: 15_000,
  });
  await next.waitForTimeout(1000);
  await expect(askCard(next, "Hear back when someone answers?")).toHaveCount(0);
  await expect(card).toHaveCount(0);
});

test("asks after connecting ELMS, and Turn on hands off to the browser's prompt", async ({
  page,
  isMobile,
}) => {
  test.slow();
  await signInNew(page, "/todo");
  // On a phone, the paste is in the side panel, a sheet the bar opens.
  if (isMobile)
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Courses and ELMS" })
      .click();
  await page
    .getByLabel("ELMS calendar link")
    .fill(testFeedLink(TEST_FEED_TOKENS.calendar));
  await page.getByRole("button", { name: "Connect ELMS" }).click();
  const card = askCard(page, "Remind you the evening before something's due?");
  await expect(card).toBeVisible({ timeout: 15_000 });
  // In the ELMS section, where the link went in.
  await expect(
    page.getByRole("region", { name: "ELMS" }).getByRole("region", {
      name: "Remind you the evening before something's due?",
    }),
  ).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `the Todo ask (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });

  // The browser's prompt, answered Block (Playwright's default): the card
  // goes, and the note says where to change it.
  await card.getByRole("button", { name: "Turn on" }).click();
  await expect(card).toHaveCount(0);
  await expect(
    liveToasts(page).getByText(
      "Your browser blocked notifications for Terpsicle. Allow them in its site settings, then try again.",
    ),
  ).toBeVisible();

  // Blocked, nothing asks again.
  await page.reload();
  await expect(page.getByText(/open · ELMS feed checked/)).toBeVisible();
  await expect(card).toHaveCount(0);
});

test.describe("on iPhone", () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test("the Home Screen app's first launch shows the Turn on step by itself, once", async ({
    page,
  }) => {
    // Opened from the Home Screen.
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "standalone", {
        get: () => true,
      }),
    );
    await signInNew(page, "/schedule");
    const sheet = page.getByRole("dialog", { name: "Turn on notifications" });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toContainText(
      "Turn on notifications. iPhone asks you to allow them.",
    );
    // Signing in joins the scheduler's own Plan A to the account (sync waits
    // for the term list, so Plan A is there by then), and its toast fades in
    // about when the sheet does. Axe reads a toast mid-fade as low contrast:
    // the scan waits for it to arrive.
    const saved = liveToasts(page).filter({
      hasText: "Your plan is saved to your account",
    });
    await expect(saved).toBeVisible();
    await expect
      .poll(() => saved.evaluate((toast) => getComputedStyle(toast).opacity))
      .toBe("1");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await scan(page, `the Home Screen ask (${colorScheme})`);
    }
    await page.emulateMedia({ colorScheme: "light" });
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();

    // A new tab of the app: it asked its once.
    const next = await page.context().newPage();
    await next.goto("/schedule");
    await expect(next.locator('[data-slot="app-bar"]')).toBeVisible();
    await next.waitForTimeout(1500);
    await expect(
      next.getByRole("dialog", { name: "Turn on notifications" }),
    ).toHaveCount(0);
  });
});
