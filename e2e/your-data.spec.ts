import { readFile } from "node:fs/promises";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";
import { signInNewUser } from "./test-user";

// Settings → Your data (docs/DATA.md §5.6): a browser's plans go into the
// data file, the file goes into another browser after a preview, Undo
// takes it out again, and an account's file carries the account's part.

/** Downloads the data file from Settings and returns it, parsed. */
async function download(page: Page): Promise<{
  path: string;
  file: {
    from: string;
    plans: { name: string }[];
    account: { profile: { id: string } } | null;
  };
}> {
  await page.goto("/settings");
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(
    /^terpsicle-data-\d{4}-\d{2}-\d{2}\.json$/,
  );
  // Kept apart from the browser's context, which deletes its downloads
  // when it closes.
  const path = test.info().outputPath(`data-${Date.now()}.json`);
  await file.saveAs(path);
  return { path, file: JSON.parse(await readFile(path, "utf8")) };
}

async function choose(page: Page, path: string) {
  await page
    .getByTitle("Choose a Terpsicle data file (.json)")
    .setInputFiles(path);
}

async function freshPage(browser: Browser, baseURL?: string) {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

test("a browser's plans go into the file, and into another browser after a preview, with Undo", async ({
  page,
  browser,
  baseURL,
}) => {
  // The demo's plans, saved in this browser while signed out.
  await page.goto("/schedule?demo=1");
  await page.getByTestId("course-row-CMSC351").waitFor();
  const { path, file } = await download(page);
  expect(file.from).toBe("browser");
  expect(file.account).toBeNull();
  expect(file.plans.length).toBeGreaterThan(0);

  const other = await freshPage(browser, baseURL);
  await other.goto("/settings");
  await choose(other, path);
  const preview = other.getByText(/^Adds \d+ plans?/);
  await expect(preview).toBeVisible();
  await scan(other, "Your data, a file's preview");
  // Nothing is added until asked.
  await other.getByRole("button", { name: "Add to this browser" }).click();
  await expect(other.getByText(/^Added \d+ plans?/)).toBeVisible();
  await expect(preview).toHaveCount(0);

  // The same file again: everything in it is here now.
  await choose(other, path);
  await expect(
    other.getByText("Everything in this file is already here."),
  ).toBeVisible();
  await other.getByRole("button", { name: "Done" }).click();

  await other.goto("/schedule");
  await expect(other.getByTestId("course-row-CMSC351")).toBeVisible();
  await other.context().close();
});

test("Undo takes out what a file added", async ({ page, browser, baseURL }) => {
  await page.goto("/schedule?demo=1");
  await page.getByTestId("course-row-CMSC351").waitFor();
  const { path } = await download(page);

  const other = await freshPage(browser, baseURL);
  await other.goto("/settings");
  await choose(other, path);
  await other.getByRole("button", { name: "Add to this browser" }).click();
  await other.getByRole("button", { name: "Undo" }).click();
  // Added again, the file adds everything once more: Undo took it all out.
  await choose(other, path);
  await expect(other.getByText(/^Adds \d+ plans?/)).toBeVisible();
  await other.context().close();
});

test("an account's file carries the account, and adding one saves to it", async ({
  page,
  browser,
  baseURL,
}) => {
  const demo = await freshPage(browser, baseURL);
  await demo.goto("/schedule?demo=1");
  await demo.getByTestId("course-row-CMSC351").waitFor();
  const { path } = await download(demo);
  await demo.context().close();

  const userId = await signInNewUser(page, "/settings");
  await expect(
    page.getByRole("button", { name: "Delete account" }),
  ).toBeVisible();
  await choose(page, path);
  await page.getByRole("button", { name: "Add to your account" }).click();
  await expect(page.getByText(/^Added \d+ plans?/)).toBeVisible();

  const { file } = await download(page);
  expect(file.from).toBe("account");
  expect(file.account?.profile.id).toBe(userId);
  expect(file.plans.length).toBeGreaterThan(0);
});
