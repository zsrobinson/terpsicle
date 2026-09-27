import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

// Chat's room rules follow the account (QA1 C7, docs/V2.md §8.6): closed with
// "Got it" on one device, they don't show on the next, not even for a moment.
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
      if (document.body?.textContent?.includes("Before you post"))
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
  await expect(laptop.getByText("Before you post")).toBeVisible();
  await laptop.getByRole("button", { name: "Got it" }).click();
  await expect(laptop.getByText("Before you post")).toBeHidden();
  // On the account: the settings doc carries it.
  await expect(async () => {
    const seen = await laptop.evaluate(async () => {
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
    expect(seen).toContain(COURSE);
  }).toPass({ timeout: 15_000 });

  const phone = await device(browser, baseURL);
  await signIn(phone, user);
  // Past the longest the page waits for the account's prefs.
  await phone.waitForTimeout(4_500);
  await expect(phone.getByText("Before you post")).toBeHidden();
  expect(await rulesShown(phone)).toBe(false);
});
