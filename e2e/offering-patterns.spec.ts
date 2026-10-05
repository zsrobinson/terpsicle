import { expect, type Page, test } from "@playwright/test";

// Offering patterns (docs/decisions.md, "Offering patterns from the
// history") on `pnpm dev:mock`, whose history has real records for a few
// CMSC courses (src/fixtures/mock/history.ts): course details' "Usually
// offered" fact, Search's greyed row for a course the term doesn't have,
// and Plan's note on a spring-only course planned for a fall, with its Move
// fix. On desktop and a phone.

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

test("course details always say when a course is usually offered", async ({
  page,
}) => {
  await page.goto("/schedule/course/CMSC452");
  // A cold page loads the scheduler and its term first: waited for as an
  // action would, as search.spec's demo rows are.
  await page
    .getByRole("heading", { name: "Elementary Theory of Computation" })
    .waitFor();
  await expect(page.getByTestId("usually-offered")).toContainText(
    "Usually offered Spring only · Next likely Spring 2028",
  );
  await expect(
    page.getByRole("img", {
      name: "Offered in 7 of the 8 springs on record since 2019, and in no fall.",
    }),
  ).toBeVisible();

  // The CS core runs every fall and spring, and says so.
  await page.goto("/schedule/course/CMSC351");
  await page.getByRole("heading", { name: "Algorithms" }).waitFor();
  await expect(page.getByTestId("usually-offered")).toContainText(
    "Usually offered Fall and spring",
  );
});

test("searching a fall-only course while building a spring finds it, greyed, with when it runs", {
  // The owner asked for this flow by name: it's in the merge gate.
  tag: ["@critical", "@phone"],
}, async ({ page }) => {
  // The owner's flow (2026-10-05): CMSC473 runs only in falls; the
  // scheduler is on Spring 2027.
  await page.goto("/schedule/search");
  await page.getByRole("combobox", { name: "Search courses" }).fill("CMSC473");
  const row = page.getByRole("option", { name: /^CMSC473/ });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-not-offered", "CMSC473");
  await expect(row).toContainText("Capstone in Machine Learning");
  await expect(row).toContainText("Not offered in Spring 2027");
  await expect(row).toContainText("Usually fall only · Next likely Fall 2027");
  await row.click();
  await expect(
    page.getByText("CMSC473 isn't offered in Spring 2027."),
  ).toBeVisible();
  await expect(page.getByTestId("usually-offered")).toContainText(
    "Usually offered Fall only · Next likely Fall 2027",
  );
});

test("Plan notes a spring-only course in a fall, and moves it", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  // Both semesters are light already, so moving makes no new problem and
  // the Move is offered.
  await add(page, isMobile, "Fall 2027", "CMSC452");
  await add(page, isMobile, "Spring 2028", "CMSC434");

  await page.goto("/plan/problems");
  // The shared problem list's row (~/components/problem-list).
  const note = page.getByTestId("problem-unlikely-term").filter({
    hasText: "CMSC452 is usually spring only",
  });
  await expect(note).toContainText(
    "Offered in 7 of the 8 springs on record since 2019, and in no fall. Last offered Spring 2027.",
  );
  // Its offering strip, in the row's extra slot.
  await expect(
    note.getByRole("img", {
      name: "Offered in 7 of the 8 springs on record since 2019, and in no fall.",
    }),
  ).toBeVisible();
  await note
    .getByRole("button", { name: "Move CMSC452 to Spring 2028" })
    .click();
  await expect(page.getByText("CMSC452 is usually spring only")).toHaveCount(0);
  const spring = await semester(page, isMobile, "Spring 2028");
  await expect(spring.getByText("CMSC452")).toBeVisible();
});
