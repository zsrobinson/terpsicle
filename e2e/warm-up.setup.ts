import { expect, test } from "@playwright/test";

// Runs before every other e2e test (the "warm-up" project in
// playwright.config.ts). A fresh `pnpm dev:mock` compiles the app on its
// first requests, which can take longer than a test's 5 s waits. CI runs e2e
// in shards, each with its own fresh server, so without this the first tests
// of each shard failed once and passed on retry.
test("the dev server has compiled the scheduler, its views and the marketing page", async ({
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
  // Each tab and drill-in is a route whose component the router splits out;
  // the dev server compiles each one on its first request.
  for (const view of [
    "search",
    "problems",
    "travel",
    "blocks",
    "generate",
    "register",
    "course/CMSC351",
  ]) {
    await page.goto(`/schedule/${view}?demo=1`);
    await expect(
      page.locator("#sidebar-panel > [data-layer][data-active]"),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.locator(
        "#sidebar-panel > [data-layer][data-active] [data-testid=panel-skeleton]",
      ),
    ).toHaveCount(0, { timeout: 60_000 });
  }
  await page.goto("/?stay");
  await expect(
    page.getByRole("heading", {
      name: "Plan the semester in five steps, in one place.",
      level: 1,
    }),
  ).toBeVisible({ timeout: 60_000 });
});
