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
    const label = name === "Before UMD" ? "Before" : name;
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: new RegExp(`^${label}`) })
      .click();
  }
  return page.getByRole("region", { name, exact: true });
}

test("pastes a transcript, checks it, imports in one step, undoes, redoes and removes grades", {
  tag: "@critical",
}, async ({ page, isMobile }) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Import your transcript" }).click();
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
    .getByRole("radiogroup", { name: /PSYC100/ })
    .getByText("DSNS", { exact: true })
    .click();
  await page
    .getByRole("radiogroup", { name: /AASP100/ })
    .getByText("DSHU", { exact: true })
    .click();
  // "Counts as": only a course Testudo lists. CHEM131 isn't in the mock
  // catalog, so AP Chemistry stays credit with no course.
  await page.getByLabel(/Testudo lists it as CHEM1XX/).fill("chem131");
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
  // ARTH200 and PHIL140 aren't in the mock catalog, so the transcript's
  // DSHU counts for them: Humanities. AP Chemistry stays credit with the
  // transcript's DSNL, which with AP Physics's DSNS is Natural Sciences.
  const gened = page.getByRole("region", { name: "GenEd progress" });
  await expect(
    gened.getByText("7 of 11 covered, with planned courses"),
  ).toBeVisible();
  await expect(
    gened.getByRole("listitem").filter({ hasText: "Natural Sciences" }),
  ).toContainText("Done");
  await expect(
    gened.getByRole("listitem").filter({ hasText: "Humanities" }),
  ).toContainText("Done");

  // A phone opens on the latest semester that came in, not Now's empty one.
  if (isMobile)
    await expect(
      page
        .getByRole("navigation", { name: "Semesters" })
        .getByRole("button", { name: /^Summer 2025/ }),
    ).toHaveAttribute("aria-current", "true");

  const fall = await semester(page, isMobile, "Fall 2024");
  await expect(fall.getByText("CMSC131")).toBeVisible();
  await expect(fall.getByText("CMSC100")).toHaveCount(0);
  const before = await semester(page, isMobile, "Before UMD");
  await expect(before.getByText("AP Chemistry")).toBeVisible();
  await expect(before.getByText("CHEM1XX")).toBeVisible();
  await expect(before.getByText("CHEM131")).toHaveCount(0);
  await expect(before.getByText(/Public Speaking/)).toBeVisible();
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

/**
 * What spills out of a semester column (or Before UMD): any header or block
 * text whose box runs past the column's edges. Text inside an element that
 * clips (an ellipsis) counts by the clipping box, which is what shows.
 */
async function spills(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const column of document.querySelectorAll<HTMLElement>(
      "section[data-term]",
    )) {
      const edge = column.getBoundingClientRect();
      if (edge.width === 0) continue;
      for (const el of column.querySelectorAll<HTMLElement>("header *, li *")) {
        let shown: HTMLElement = el;
        for (
          let up = el.parentElement;
          up && up !== column;
          up = up.parentElement
        )
          if (getComputedStyle(up).overflowX !== "visible") shown = up;
        const box = shown.getBoundingClientRect();
        if (box.width === 0) continue;
        if (box.right > edge.right + 0.5 || box.left < edge.left - 0.5)
          out.push(`${column.dataset.term}: "${el.textContent?.slice(0, 30)}"`);
      }
    }
    return out;
  });
}

test("a year with a winter and a summer keeps every semester's text inside its column", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan/import");
  await page.getByLabel("Paste your unofficial transcript").fill(PASTE);
  await page
    .getByRole("radiogroup", { name: /PSYC100/ })
    .getByText("DSNS", { exact: true })
    .click();
  await page
    .getByRole("radiogroup", { name: /AASP100/ })
    .getByText("DSHU", { exact: true })
    .click();
  await page.getByRole("button", { name: "Import 21 courses" }).click();
  await expect(
    page.getByText("Imported 21 courses from 4 semesters and Before UMD"),
  ).toBeVisible();
  const terms = ["Fall 2024", "Winter 2025", "Spring 2025", "Summer 2025"];

  if (isMobile) {
    for (const name of terms) {
      const column = await semester(page, isMobile, name);
      await expect(column.getByRole("listitem").first()).toBeVisible();
      expect(await spills(page), name).toEqual([]);
    }
    return;
  }

  // The bug: squeezed into half a row beside Year 2, Year 1's four columns
  // were ~120px wide and their counts ran into the next column.
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ];
  for (const { width, height } of sizes) {
    await page.setViewportSize({ width, height });
    const fall = page.getByRole("region", { name: "Fall 2024", exact: true });
    await expect(fall.getByText("Object-Oriented Programming I")).toBeVisible();
    expect(await spills(page), `${width}×${height}`).toEqual([]);
    if (width >= 1280) {
      const boxes = await Promise.all(
        terms.map((name) =>
          page.getByRole("region", { name, exact: true }).boundingBox(),
        ),
      );
      for (const box of boxes) {
        // One line of four, each wide enough for a block's code and title.
        expect(box?.y).toBe(boxes[0]?.y);
        expect(box?.width).toBeGreaterThanOrEqual(200);
      }
    }
  }
});
