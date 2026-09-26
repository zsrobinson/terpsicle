import { expect, type Page, test } from "@playwright/test";

// The CSP (docs/V2.md §12, src/server/security/headers.ts) against `/`
// (with its returning check) and the scheduler's main flows on
// `/schedule?demo=1`: search, adding a section, the Travel tab and a
// route's map. None may trip it. The policy is
// report-only, so a violation breaks nothing on screen; Chrome logs it to
// the console (the wording varies by version) and fires
// `securitypolicyviolation`, and this test watches both.
//
// Mock mode draws the route without MapLibre (no tiles offline); MapLibre's
// sources (its blob: worker and images, /data range requests) are in the
// policy and checked against live data by hand.

test.skip(({ isMobile }) => isMobile, "desktop flows");

type Watched = Window & { __cspViolations?: string[] };

async function watchCsp(page: Page) {
  const logged: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy"))
      logged.push(message.text());
  });
  await page.addInitScript(() => {
    const w = window as Watched;
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      // Where from, so a failure says what to fix.
      w.__cspViolations?.push(
        `${event.effectiveDirective} ${event.blockedURI} ${event.disposition} ${event.sourceFile}:${event.lineNumber}`,
      );
    });
  });
  const events = () =>
    page.evaluate(() => (window as Watched).__cspViolations ?? []);
  return { logged, events };
}

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Sidebar" });

test("/, then search, add a section, Travel and a route map: no CSP violations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const csp = await watchCsp(page);

  // A first visit to /: the marketing page, after its head script's check.
  const landing = await page.goto("/");
  // The policy is really there, with a nonce for TanStack's scripts and
  // hashes for ours.
  const policy =
    (await landing?.headerValue("content-security-policy-report-only")) ?? "";
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'sha256-/);
  await expect(
    page.getByRole("heading", {
      name: "Your semester's a tangle of tabs. Let's straighten it out.",
      level: 1,
    }),
  ).toBeVisible();

  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();

  // Search, and add a section.
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search courses" }).fill("engl 101");
  await page.locator('[data-course-result="ENGL101"]').click();
  await page
    .getByTestId("sections")
    .locator('[data-section="0101"]')
    .getByRole("button", { name: "Add 0101" })
    .click();
  await expect(page.getByTestId("your-section")).toContainText("In Plan A");

  // The Travel tab, and a connection's route drawn on its map.
  await page.getByRole("button", { name: "Travel", exact: true }).click();
  await sidebar(page)
    .getByRole("button", { name: /^CMSC330 to ECON200/ })
    .first()
    .click();
  await expect(page.getByTestId("route-drawing")).toBeVisible();

  // A control: an inline script the policy doesn't allow must be caught,
  // so an empty list below means none happened, not that none were seen.
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__cspControl = 1;";
    document.head.append(script);
  });
  const control = expect.stringMatching(/^script-src-elem inline report /);
  await expect.poll(csp.events).toContainEqual(control);
  await expect.poll(() => csp.logged.length).toBeGreaterThan(0);

  // Only the control: nothing the app did tripped the policy.
  expect(await csp.events()).toEqual([control]);
  // The console has only the control's line too. Its wording changes with
  // the Chrome version, so only the words every version uses are checked.
  expect(csp.logged).toEqual([expect.stringMatching(/inline script/i)]);
  expect(errors).toEqual([]);
});
