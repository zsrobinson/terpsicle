import { expect, type Page, test } from "@playwright/test";

// On a phone, every control in the family bar takes a tap anywhere across
// the bar's height and is never narrower than 24px (WCAG 2.5.8), while its
// icon keeps its size (docs/ACCESSIBILITY.md, "Touch targets"). The
// scheduler's bar is the crowded one: the term, the plan tab, New plan,
// problems and the account all share 390px.

test.skip(({ isMobile }) => !isMobile, "The hit areas are for touch");

/** Each visible bar control, and whether a tap near its top and bottom lands. */
async function barTargets(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-slot="app-bar"]');
    if (!bar) return [];
    const barBox = bar.getBoundingClientRect();
    return [...bar.querySelectorAll<HTMLElement>("a[href], button")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const box = el.getBoundingClientRect();
        const x = box.left + box.width / 2;
        // 4px inside the bar's top and bottom hairlines.
        const hits = [barBox.top + 4, barBox.bottom - 5].map((y) => {
          const at = document.elementFromPoint(x, y);
          return at !== null && (at === el || el.contains(at));
        });
        return {
          name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
          width: Math.round(box.width),
          hits,
        };
      });
  });
}

for (const path of ["/schedule?demo=1", "/reviews", "/todo"]) {
  test(`the bar's controls are thumb-sized on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-slot="app-bar"]')).toBeVisible({
      timeout: 20_000,
    });
    // The page's own heading: the account and the page have answered, so the
    // bar holds what it will.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForLoadState("networkidle");
    if (path.startsWith("/schedule"))
      await expect(page.locator("[data-workbench-drawer]")).toBeVisible({
        timeout: 20_000,
      });
    const targets = await barTargets(page);
    expect(targets.length).toBeGreaterThan(1);
    const short = targets.filter((t) => t.width < 24 || !t.hits.every(Boolean));
    expect(short).toEqual([]);
  });
}

test("signed in, the account is thumb-sized too", async ({ page }) => {
  await page.goto("/privacy");
  const status = await page.evaluate(async () => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "tstudent", return: "/reviews" }),
    });
    return response.status;
  });
  expect(status).toBe(200);
  await page.goto("/reviews");
  // The bell is in the account menu on a phone: the avatar is the bar's
  // signed-in control.
  await expect(page.getByRole("button", { name: /^Account: / })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("notifications-bell")).toHaveCount(0);
  const targets = await barTargets(page);
  expect(targets.map((t) => t.name)).toContainEqual(
    expect.stringMatching(/^Account: /),
  );
  const short = targets.filter((t) => t.width < 24 || !t.hits.every(Boolean));
  expect(short).toEqual([]);
});
