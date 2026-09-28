import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// /settings/notifications grouped by product, then "When and how" (V2.md
// §6.7), on `pnpm dev:mock` signed in with test mode: quiet hours are on,
// seat openings come through them, and message text shows, until you
// switch them; what you switch is saved.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** A new E2E person each run: the local D1 outlives runs. */
async function signIn(page: Page) {
  await page.goto("/settings");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/settings/notifications" }),
    });
    const result: { return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  expect(next).toContain("/settings/notifications");
}

test("groups the switches by product and saves quiet hours", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/settings/notifications");
  const main = page.getByRole("main");
  await expect(
    main.getByText(
      "Everything also shows in the bell, whatever you turn off here.",
    ),
  ).toBeVisible();
  const headings = main.getByRole("heading", { level: 2 });
  await expect(headings.nth(0)).toHaveText("Schedule");
  await expect(headings.nth(1)).toHaveText("Chat");
  await expect(headings.nth(2)).toHaveText("Todo");
  await expect(headings.nth(3)).toHaveText("When and how");

  const quiet = main.getByRole("switch", { name: "Quiet hours", exact: true });
  const seats = main.getByRole("switch", {
    name: "Seat openings come through quiet hours",
  });
  const text = main.getByRole("switch", { name: "Show message text" });
  await expect(quiet).toHaveAttribute("aria-checked", "true");
  await expect(seats).toHaveAttribute("aria-checked", "true");
  await expect(text).toHaveAttribute("aria-checked", "true");
  await expect(main.getByText(/Comes through quiet hours\./)).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await scan(page, `notification settings, quiet hours on (${scheme})`);
  }

  // Each switch saves as it's pressed.
  const saved = () =>
    page.waitForResponse(
      (r) => r.url().endsWith("/api/notifications/settings/set") && r.ok(),
    );
  let save = saved();
  await text.click();
  await save;
  save = saved();
  await quiet.click();
  await save;
  await expect(quiet).toHaveAttribute("aria-checked", "false");
  // Nothing waits now, so seats' own switch rests.
  await expect(seats).toHaveAttribute("aria-disabled", "true");
  await expect(main.getByText(/Comes through quiet hours\./)).toHaveCount(0);

  await page.reload();
  await expect(quiet).toHaveAttribute("aria-checked", "false");
  await expect(text).toHaveAttribute("aria-checked", "false");
  await expect(seats).toHaveAttribute("aria-disabled", "true");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await scan(page, `notification settings, quiet hours off (${scheme})`);
  }
});
