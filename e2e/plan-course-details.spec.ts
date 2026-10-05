import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";
import { expectToastAboveDrawer } from "./toasts";

// Courses Testudo doesn't list anymore (docs/V3.md §2.2), on `pnpm dev:mock`:
// a synthetic transcript with an honors code whose base course Testudo
// lists, a dropped topics course, and a seminar whose GenEds the transcript
// prints. Synthetic data only, never a real transcript.

const PASTE = `Unofficial Transcript                                   Sam Testudo
UID XXXXXXXXX
Program: Computer Science (CMNS)

Fall 2024
    MATH141H CALCULUS II                      A     4.00    4.00   16.00
    CMSC298X OLD TOPICS SEMINAR               A-    3.00    3.00   11.10
    HNUH278B DEMOCRATIC HABITS                A     3.00    3.00   12.00   DSHS, SCIS
    Meth = Reg     Sem: 10.00 crds   GPA 3.90
    ==========================================================
`;

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
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

test("a course Testudo dropped gets its course info, from its base course or by hand", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Import your transcript" }).click();
  await page.getByLabel("Paste your unofficial transcript").fill(PASTE);
  // The seminar's GenEds come from the transcript; the other two wait on details.
  await expect(
    page.getByText(/imports with the GenEds your transcript lists/),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Import 3 courses" }).click();
  await expect(
    page.getByText("Imported 3 courses from 1 semester"),
  ).toBeVisible();

  await page.goto("/plan/problems");
  const problems = page.getByRole("group", { name: "Problems", exact: true });
  await expect(problems.getByText("MATH141H isn't in Testudo")).toBeVisible();
  await expect(problems.getByText("CMSC298X isn't in Testudo")).toBeVisible();
  await expect(problems.getByText(/HNUH278B/)).toHaveCount(0);
  await axe(page, "problems with details to add");

  // An honors code: one click counts it as its base course.
  await problems.getByRole("button", { name: "Count it as MATH141" }).click();
  await expect(problems.getByText("MATH141H isn't in Testudo")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(problems.getByText("MATH141H isn't in Testudo")).toBeVisible();
  await problems.getByRole("button", { name: "Count it as MATH141" }).click();
  // On a phone its Undo toast stays clear of the next problem's button.
  if (isMobile) {
    await expect(page.locator("[data-workbench-drawer]")).toHaveAttribute(
      "data-snap",
      "half",
    );
    await expectToastAboveDrawer(page);
  }

  // Any other: say what it was.
  await problems
    .getByRole("listitem")
    .filter({ hasText: "CMSC298X" })
    .getByRole("button", { name: "Add course info" })
    .click();
  const form = page.getByRole("form", { name: "Add course info" });
  await expect(form.getByLabel("Title")).toHaveValue("Old Topics Seminar");
  await expect(form.getByLabel("Credits")).toHaveValue("3");
  await form.getByLabel("Title").fill("Old Topics Seminar");
  await form.getByRole("button", { name: /^DSHU/ }).click();
  await expect(form.getByRole("button", { name: /^DSHU/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await axe(page, "the details form");
  await form.getByRole("button", { name: "Save course info" }).click();
  await expect(page.getByText("Saved CMSC298X's course info")).toBeVisible();
  await expect(page.getByText("Old Topics Seminar").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();

  await page.goto("/plan/problems");
  await expect(
    page.getByText(
      "Prerequisites out of order, light semesters, repeated courses, courses Testudo hasn't offered lately and transfer credit it didn't match show up here.",
    ),
  ).toBeVisible();
  // Its Humanities, and the seminar's History and I-Series, count.
  await page.goto("/plan");
  const gened = page.getByRole("region", { name: "GenEd progress" });
  for (const label of ["Humanities", "History and Social Sciences", "I-Series"])
    await expect(
      gened.getByRole("listitem").filter({ hasText: label }),
    ).toContainText("1 done, needs 1 more");
});
