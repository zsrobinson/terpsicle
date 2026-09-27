import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// Terpsicle Plan (docs/V3.md §2.13) on `pnpm dev:mock`: the first visit,
// adding a course and a placeholder from Search, moving a block with the
// keyboard through its menu, and undo, on desktop and a phone. Local first:
// nothing here signs in.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // In Fall 2026: a plan from Fall 2025 has done, in-progress and planned semesters.
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Axe in both themes, with the shared rules (./axe). */
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
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: `${season?.slice(0, 2)} ${year}` })
      .click();
  }
  return page.getByRole("region", { name, exact: true });
}

test("starts a plan, adds a course and a placeholder, moves with the keyboard, and undoes", async ({
  page,
  isMobile,
}) => {
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "Plan your four years" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Paste your transcript" }),
  ).toBeVisible();
  await axe(page, "first visit");

  await page.getByLabel("I started at UMD in").selectOption("202508");
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page.getByRole("button", { name: /^My plan/ })).toBeVisible();

  // A course, from the semester's own "Add a course".
  const spring = await semester(page, isMobile, "Spring 2027");
  await spring
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  const search = page.getByRole("searchbox", { name: "Search courses" });
  await expect(search).toBeFocused();
  await search.fill("CMSC351");
  await page
    .getByRole("button", { name: "Add CMSC351 to Spring 2027", exact: true })
    .click();
  await expect(spring.getByText("CMSC351")).toBeVisible();
  await expect(spring.getByText("Algorithms")).toBeVisible();
  // Already there: "Added", not a second Add.
  await expect(
    page.getByRole("button", {
      name: "Add CMSC351 to Spring 2027",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByTestId("plan-search-added")).toBeVisible();

  // A placeholder: typing a pattern offers one first.
  await search.fill("cmsc4xx");
  await page
    .getByRole("button", { name: "Add CMSC4XX to Spring 2027", exact: true })
    .click();
  await expect(spring.getByText("Any CMSC 400-level")).toBeVisible();
  await expect(page.getByText("6 of 120 credits")).toBeVisible();

  // Move CMSC351 with the keyboard alone: its menu, Move to…, Fall 2027.
  await spring.getByRole("button", { name: "CMSC351 options" }).focus();
  await page.keyboard.press("Enter");
  const moveTo = page.getByRole("menuitem", { name: "Move to…" });
  await expect(moveTo).toBeVisible();
  await moveTo.focus();
  await page.keyboard.press("ArrowRight");
  const fall2027 = page.getByRole("menuitem", { name: /^Fall 2027/ });
  await expect(fall2027).toBeVisible();
  await fall2027.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Moved CMSC351 to Fall 2027")).toBeVisible();

  const fall = await semester(page, isMobile, "Fall 2027");
  await expect(fall.getByText("CMSC351")).toBeVisible();

  // Undo with the keyboard: it goes back where it was.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByText("Undone")).toBeVisible();
  await expect(fall.getByText("CMSC351")).toHaveCount(0);
  const back = await semester(page, isMobile, "Spring 2027");
  await expect(back.getByText("CMSC351")).toBeVisible();
  await axe(page, "a plan");

  // Saved in this browser.
  await page.reload();
  const again = await semester(page, isMobile, "Spring 2027");
  await expect(again.getByText("CMSC351")).toBeVisible();
  await expect(again.getByText("Any CMSC 400-level")).toBeVisible();

  // Enter adds the top result, like its Add button.
  await again
    .getByRole("button", { name: "Add a course to Spring 2027" })
    .click();
  await expect(search).toBeFocused();
  await search.fill("CMSC330");
  await expect(
    page.getByRole("button", {
      name: "Add CMSC330 to Spring 2027",
      exact: true,
    }),
  ).toBeVisible();
  await search.press("Enter");
  await expect(again.getByText("CMSC330")).toBeVisible();
  await expect(page.getByTestId("plan-search-added")).toBeVisible();
});
