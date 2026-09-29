import { expect, type Page, test } from "@playwright/test";

// `/` when one of its demo chunks doesn't arrive while the page is starting
// (src/lib/load-recovery.ts, ~/lib/lazy-component). It must still come to
// life and answer a click: never a page left drawn but dead behind a note.
// On the production build (playwright.build.config.ts), where the chunks
// are the real hashed files and Vite's loader is the one reporting.

const PIECES = /\/assets\/pieces-[\w-]{8}\.js$/;

/** The page's code is running (MarketingPage sets it once hydrated). */
const ready = (page: Page) =>
  expect(page.locator("[data-marketing=ready]")).toBeAttached({
    timeout: 15_000,
  });

/** A step button answers: the page is alive. */
async function stepsWork(page: Page) {
  const steps = page.getByRole("navigation", { name: "Steps" });
  const reviews = steps.getByRole("button", { name: "Reviews" });
  await reviews.click();
  await expect(reviews).toHaveAttribute("aria-pressed", "true");
}

test("a demo chunk the network drops: the page starts, answers, and shows no note", async ({
  page,
}) => {
  // Every attempt fails, the recovery's own check included: offline.
  await page.route(PIECES, (route) => route.abort("internetdisconnected"));
  await page.goto("/?stay");
  await ready(page);
  await stepsWork(page);
  await expect(page.locator("#load-error")).toHaveCount(0);
});

test("a demo chunk a deploy removed: one reload, then the page starts with a note it can dismiss", async ({
  page,
  isMobile,
}) => {
  // A phone asks for the demos only as the steps come near, well after
  // it has started; the wide page asks while it's still starting.
  test.skip(isMobile, "a phone loads the demos later, on scroll or a step");
  let loads = 0;
  page.on("load", () => loads++);
  await page.route(PIECES, (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await page.goto("/?stay");
  // The first page reloads itself once to get the new version…
  await expect.poll(() => loads).toBeGreaterThanOrEqual(2);
  // …and the reloaded page, missing the same file, still comes to life.
  await ready(page);
  await stepsWork(page);
  const note = page.locator("#load-error");
  await expect(note).toHaveAttribute("role", "status");
  await note.getByRole("button", { name: "Dismiss" }).click();
  await expect(note).toHaveCount(0);
  expect(loads).toBe(2);
});
