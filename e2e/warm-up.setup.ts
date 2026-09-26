import { expect, test } from "@playwright/test";

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
    page.getByRole("heading", { name: "Terpsicle", level: 1 }),
  ).toBeVisible({ timeout: 60_000 });
});
