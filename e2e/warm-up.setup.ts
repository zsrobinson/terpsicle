import { expect, type Locator, test } from "@playwright/test";

// Runs before every other e2e test (the "warm-up" project in
// playwright.config.ts). A fresh `pnpm dev:mock` compiles the app on its
// first requests, which can take longer than a test's 5 s waits. CI runs e2e
// in shards, each with its own fresh server, so without this the first tests
// of each shard failed once and passed on retry.
test("the dev server has compiled the scheduler and the marketing page", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/schedule?demo=1");
  await expect(
    page
      .getByRole("region", { name: "Week calendar" })
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  await page.goto("/?stay");
  await expect(
    page.getByRole("heading", {
      name: "Your semester's a tangle of tabs. Let's straighten it out.",
      level: 1,
    }),
  ).toBeVisible({ timeout: 60_000 });
  // Its lazy parts too: every sample on the way down, and the footer's
  // contact at the end. Scrolling again until it sticks: the router puts the
  // page back at the top when it hydrates.
  const reach = async (target: Locator, loaded: Locator) =>
    expect(async () => {
      await target.scrollIntoViewIfNeeded();
      await expect(loaded).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
  for (const id of ["schedule", "reviews", "chat", "plan", "todo"]) {
    const sample = page.locator(`section#${id} [data-preview]`);
    await reach(sample, sample.getByText(/^Sample/).first());
  }
  const footer = page.getByRole("contentinfo");
  await reach(footer, footer.getByRole("button", { name: "Email us" }));
});
