import { expect, type Page, test } from "@playwright/test";

// Offering patterns (docs/decisions.md, "Offering patterns from the
// history") on `pnpm dev:mock`, whose history has real records for a few
// CMSC courses (src/fixtures/mock/history.ts): Schedule's "Usually offered"
// line, and Plan's note on a spring-only course planned for a fall, with its
// Move fix and Undo. On desktop and a phone.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** A semester's column; on a phone, picked from the strip first. */
async function semester(page: Page, isMobile: boolean, name: string) {
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name })
      .click();
  return page.getByRole("region", { name, exact: true });
}

async function add(page: Page, isMobile: boolean, term: string, code: string) {
  const column = await semester(page, isMobile, term);
  await column.getByRole("button", { name: `Add a course to ${term}` }).click();
  await page.getByRole("searchbox", { name: "Search courses" }).fill(code);
  await page
    .getByRole("button", { name: `Add ${code} to ${term}`, exact: true })
    .click();
  await expect(column.getByText(code)).toBeVisible();
}

test("course details say when a course is usually offered, and only then", async ({
  page,
}) => {
  await page.goto("/schedule/course/CMSC452");
  await expect(page.getByTestId("usually-offered")).toHaveText(
    "Usually offered: Spring only · Next likely: Spring 2028",
  );
  await expect(
    page.getByRole("img", {
      name: "Offered in 7 of the 8 springs on record since 2019, and in no fall.",
    }),
  ).toBeVisible();

  // The CS core runs every fall and spring: nothing to say.
  await page.goto("/schedule/course/CMSC351");
  await expect(page.getByRole("heading", { name: "Algorithms" })).toBeVisible();
  await expect(page.getByTestId("usually-offered")).toHaveCount(0);
});

test("Plan notes a spring-only course in a fall, and moves it", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  await add(page, isMobile, "Fall 2027", "CMSC452");
  await add(page, isMobile, "Fall 2027", "CMSC420");
  await add(page, isMobile, "Fall 2027", "CMSC421");
  await add(page, isMobile, "Fall 2027", "CMSC451");
  await add(page, isMobile, "Fall 2027", "CMSC433");
  await add(page, isMobile, "Spring 2028", "CMSC434");
  await add(page, isMobile, "Spring 2028", "CMSC422");
  await add(page, isMobile, "Spring 2028", "CMSC424");
  await add(page, isMobile, "Spring 2028", "CMSC417");

  await page.goto("/plan/problems");
  const problems = page.getByRole("list", { name: "Problems" });
  const note = problems.getByRole("listitem").filter({
    hasText: "CMSC452 is usually spring only",
  });
  await expect(note).toContainText(
    "Offered in 7 of the 8 springs on record since 2019, and in no fall. Last offered Spring 2027.",
  );
  await note
    .getByRole("button", { name: "Move CMSC452 to Spring 2028" })
    .click();
  await expect(
    problems.getByText("CMSC452 is usually spring only"),
  ).toHaveCount(0);
  const spring = await semester(page, isMobile, "Spring 2028");
  await expect(spring.getByText("CMSC452")).toBeVisible();
});
