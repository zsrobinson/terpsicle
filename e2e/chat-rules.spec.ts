import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

// Chat's "Posting here" note follows the account (QA1 C7, docs/V2.md §8.6):
// closed with "Got it" or a first post on one device, it doesn't show on the
// next, not even for a moment.
// A throwaway `e2e…` person (test mode only), so runs never share an account.

test.skip(({ isMobile }) => isMobile, "two devices, desktop interactions");

const TERM = "202701";
const COURSE = "CMSC131";
const ROOM = `/chat?term=${TERM}&course=${COURSE}&room=${TERM}:${COURSE}`;

let errors: string[] = [];
const contexts: BrowserContext[] = [];

test.beforeEach(() => {
  errors = [];
});

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(errors).toEqual([]);
});

/** A fresh browser profile, as another device has, noting if the rules ever show. */
async function device(browser: Browser, baseURL?: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const w = window as unknown as { rulesShown: boolean };
    w.rulesShown = false;
    new MutationObserver(() => {
      if (document.querySelector('[aria-label="Posting here"]'))
        w.rulesShown = true;
    }).observe(document, { childList: true, subtree: true });
  });
  return page;
}

async function signIn(page: Page, userId: string) {
  await page.goto("/privacy");
  const next = await page.evaluate(
    async ({ id, room }) => {
      const response = await fetch("/api/auth/test-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, return: room }),
      });
      const result: { return?: string } = await response.json();
      return result.return ?? "";
    },
    { id: userId, room: ROOM },
  );
  await page.goto(next);
  await expect(
    page.getByRole("textbox", { name: new RegExp(`^Message ${COURSE}`) }),
  ).toBeVisible();
}

/** The note over the composer (room info has its own "Posting here"). */
const note = (page: Page) => page.getByRole("region", { name: "Posting here" });

/** Whether the account's settings doc has the course's note closed. */
async function closedOnAccount(page: Page): Promise<string[] | undefined> {
  return page.evaluate(async () => {
    const response = await fetch("/api/sync/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ since: 0 }),
    });
    const page: {
      docs: {
        kind: string;
        body: { prefs?: { chatRules?: { seen: string[] } } };
      }[];
    } = await response.json();
    return page.docs.find((d) => d.kind === "settings")?.body.prefs?.chatRules
      ?.seen;
  });
}

const rulesShown = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { rulesShown: boolean }).rulesShown,
  );

test("room rules closed on one device stay closed on the next", async ({
  browser,
  baseURL,
}) => {
  const user = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const laptop = await device(browser, baseURL);
  await signIn(laptop, user);
  await expect(note(laptop)).toBeVisible();
  // Plain words, not a lecture.
  await expect(note(laptop)).toContainText(
    "Your name is on everything you post here",
  );
  await laptop.getByRole("button", { name: "Got it" }).click();
  await expect(note(laptop)).toBeHidden();
  // On the account: the settings doc carries it.
  await expect(async () => {
    expect(await closedOnAccount(laptop)).toContain(COURSE);
  }).toPass({ timeout: 15_000 });

  const phone = await device(browser, baseURL);
  await signIn(phone, user);
  // Past the longest the page waits for the account's prefs.
  await phone.waitForTimeout(4_500);
  await expect(note(phone)).toBeHidden();
  expect(await rulesShown(phone)).toBe(false);
});

test("a first post closes the note, like Got it", async ({
  browser,
  baseURL,
}) => {
  const user = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const laptop = await device(browser, baseURL);
  await signIn(laptop, user);
  await expect(note(laptop)).toBeVisible();
  const field = laptop.getByRole("textbox", {
    name: new RegExp(`^Message ${COURSE}`),
  });
  await field.fill(`hi, anyone else in the 9am? ${user}`);
  await field.press("Enter");
  await expect(
    laptop.getByRole("log").getByRole("article").filter({ hasText: user }),
  ).toBeVisible();
  await expect(note(laptop)).toBeHidden();
  await expect(async () => {
    expect(await closedOnAccount(laptop)).toContain(COURSE);
  }).toPass({ timeout: 15_000 });
});
