import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";
import { lowerPlanDrawer } from "./plan-drawer";

// Transfer and exam credit Testudo can't match (docs/V3.md §2.10), on
// `pnpm dev:mock`: a synthetic transcript with IB credit, a community
// college course Testudo gave as "GEOL 1XX", an elective, and a course UMD
// hasn't evaluated yet. Say what the GEOL credit counts as from Problems,
// then undo it. Synthetic data only, never a real transcript.

const PASTE = `SYNTHETIC FIXTURE
Unofficial Transcript                                   Sam Testudo
UID XXXXXXXXX                                           sam.testudo@example.edu

Transfer Credit
  International Baccalaureate
    IB ENGLISH A LIT HL               P     ENGL101   3.00   FSAW
  Howard Community College
    1   PHYSICAL GEOLOGY              A     GEOL 1XX  3.00   DSNS
    1   INTRODUCTION TO GLOBAL
        ISSUES                        B+    LTR       3.00   L1
    2   ANATOMY AND PHYSIOLOGY I      B     NE        4.00
  Transfer credit accepted: 9.00

Fall 2025
    CMSC131  OBJECT-ORIENTED PROG I           A     4.00    4.00   16.00
    Meth = Reg     Sem: 4.00 crds   GPA 4.00
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

test("imports transfer and exam credit, and says what unmatched credit counts as", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await page.getByRole("button", { name: "Import your transcript" }).click();
  await expect(
    page.getByText(
      "Your transcript is read here, in your browser, and never saved or sent. Only the courses you import are saved.",
    ),
  ).toBeVisible();
  await page.getByLabel("Paste your unofficial transcript").fill(PASTE);

  // IB is exam credit; a wrapped title reads whole; UMD hasn't evaluated
  // one course, so it's left out and says why.
  const before = page.getByRole("region", { name: "Before UMD" });
  await expect(before.getByText("Exam", { exact: true })).toBeVisible();
  await expect(
    before.getByText("INTRODUCTION TO GLOBAL ISSUES", { exact: true }),
  ).toBeVisible();
  await expect(
    before.getByText(/UMD hasn't finished evaluating it/),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Import ANATOMY AND PHYSIOLOGY I" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Import 4 courses" }).click();
  await expect(
    page.getByText("Imported 4 courses from 1 semester and Before UMD"),
  ).toBeVisible();

  const column = await semester(page, isMobile, "Before UMD");
  await expect(column.getByText("Transfer credit · GEOL 1XX")).toBeVisible();

  // Problems asks what the GEOL credit counts as, and opens its drill-in.
  await page.goto("/plan/problems");
  const problems = page.getByRole("list", { name: "Problems" });
  const row = problems
    .getByRole("listitem")
    .filter({ hasText: "PHYSICAL GEOLOGY came in as GEOL 1XX" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Choose what it counts as" }).click();
  await expect(page).toHaveURL(/credit=/);
  const form = page.getByRole("form", { name: "What it counts as" });
  // The department's 100-level courses come first.
  await expect(form.getByRole("button", { name: /^GEOL100/ })).toBeVisible();
  await form.getByLabel("Counts as").fill("geol 100");
  await form.getByRole("button", { name: /^GEOL100/ }).click();
  await expect(form.getByText("GEOL100", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Credits")).toHaveValue("3");
  // The transcript's GenEds stay what UMD granted.
  await expect(form.getByRole("button", { name: /^DSNS/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await axe(page, "a transfer credit's drill-in");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("PHYSICAL GEOLOGY counts as GEOL100"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();

  // The block keeps its own title and says what it counts as.
  if (isMobile) await lowerPlanDrawer(page);
  const after = await semester(page, isMobile, "Before UMD");
  await expect(after.getByText("PHYSICAL GEOLOGY")).toBeVisible();
  await expect(after.getByText("Counts as GEOL100")).toBeVisible();

  // Undo takes it back, and Problems asks again.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(after.getByText("Counts as GEOL100")).toHaveCount(0);
  await page.goto("/plan/problems");
  await expect(
    page.getByText("PHYSICAL GEOLOGY came in as GEOL 1XX"),
  ).toBeVisible();
});
