import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// Terpsicle Plan's transcript import (docs/V3.md §2.10) on `pnpm dev:mock`:
// paste a redacted golden fixture from the first visit, check it (the "or"
// chooser, a line left out, transfer mapping), import in one step, undo and
// redo, and Remove grades. Synthetic data only, never a real transcript.

const PASTE = readFileSync(
  "src/core/four-year/transcript/__fixtures__/synthetic-ap-transfer.txt",
  "utf8",
);

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Fall 2026: every semester of the fixture (Fall 2024 to Summer 2025) is done.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function axe(page: Page, what: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `${what} (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

/** A semester's column; on a phone, picked from the strip first. */
async function semester(page: Page, isMobile: boolean, name: string) {
  if (isMobile) {
    const [season, year] = name.split(" ");
    const label =
      name === "Before UMD" ? "Before" : `${season?.slice(0, 2)} ${year}`;
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: new RegExp(`^${label}`) })
      .click();
  }
  return page.getByRole("region", { name, exact: true });
}

test("pastes a transcript, checks it, imports in one step, undoes, redoes and removes grades", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Paste your transcript" }).click();
  const box = page.getByLabel("Paste your unofficial transcript");
  await expect(box).toBeFocused();
  await expect(page).toHaveURL(/\/plan\/import/);

  // Not a transcript: a specific line, and nothing to import.
  await box.fill("Dear Sam, see you Tuesday.");
  await expect(
    page.getByText(
      "That doesn't look like a UMD unofficial transcript. Copy the whole page from Testudo's Unofficial Transcript.",
    ),
  ).toBeVisible();

  // Whatever is pasted stays out of the URL.
  await box.fill(PASTE);
  expect(page.url()).not.toContain("Testudo");
  await expect(
    page.getByRole("heading", { name: "Check what we read" }),
  ).toBeVisible();
  const importButton = page.getByRole("button", { name: "Import 21 courses" });
  await expect(importButton).toBeDisabled();
  await axe(page, "the check step");

  // The "or" chooser, then the button is ready.
  await page
    .getByRole("group", { name: /PSYC100/ })
    .getByText("DSNS", { exact: true })
    .click();
  await page
    .getByRole("group", { name: /AASP100/ })
    .getByText("DSHU", { exact: true })
    .click();
  // Transfer mapping: AP Chemistry counts as CHEM131 (not in the mock catalog).
  await page.getByLabel(/Testudo lists it as CHEM 1XX/).fill("chem131");
  await expect(page.getByText(/CHEM131 isn't in Testudo/)).toBeVisible();
  // Leave one line out.
  await page.getByRole("checkbox", { name: "Import CMSC100" }).uncheck();
  await expect(
    page.getByRole("button", { name: "Import 20 courses" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Import 20 courses" }).click();

  await expect(
    page.getByText("Imported 20 courses from 4 semesters and Before UMD"),
  ).toBeVisible();
  await expect(page.getByText("68 of 120 credits").first()).toBeVisible();
  // GenEd progress counts what came in: ENGL101 by AP is Academic Writing,
  // and AP Calculus (MATH140 and MATH141) is Math and Analytic Reasoning.
  const gened = page.getByRole("region", { name: "GenEd progress" });
  await expect(
    gened.getByText("5 of 11 categories covered", { exact: false }),
  ).toBeVisible();

  const fall = await semester(page, isMobile, "Fall 2024");
  await expect(fall.getByText("CMSC131")).toBeVisible();
  await expect(fall.getByText("CMSC100")).toHaveCount(0);
  const before = await semester(page, isMobile, "Before UMD");
  await expect(before.getByText("CHEM131")).toBeVisible();
  await expect(before.getByText(/PUBLIC SPEAKING/)).toBeVisible();
  await axe(page, "an imported plan");

  // One step: undo takes the whole import back, redo brings it again.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByText("0 of 120 credits").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(page.getByText("68 of 120 credits").first()).toBeVisible();

  // Grades show on done blocks, and one menu item removes them all.
  const fallAgain = await semester(page, isMobile, "Fall 2024");
  await expect(fallAgain.getByText("A-", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^My plan/ }).click();
  await page.getByRole("menuitem", { name: "Remove grades" }).click();
  await expect(page.getByText("Removed the grades from My plan")).toBeVisible();
  await expect(fallAgain.getByText("A-", { exact: true })).toHaveCount(0);
  await expect(page.getByText("68 of 120 credits").first()).toBeVisible();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(fallAgain.getByText("A-", { exact: true })).toBeVisible();
});
