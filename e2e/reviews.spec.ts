import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// Terpsicle Reviews end to end (docs/V2.md §7), on `pnpm dev:mock`: the
// fixtures' PlanetTerp data, the real /api/reviews/* over local D1, and
// test-mode sign-in. Mock mode has no Workers AI, so the moderation check
// can't finish and every new review waits for a person, as it would when
// the model is down: the "waiting" state is what a writer sees here.
//
// Keiko Ashdown ("ashdown_keiko") teaches CMSC351 in the mock term, with 142
// PlanetTerp reviews at 3.1.

const INSTRUCTOR = "/reviews/instructors/ashdown_keiko?course=CMSC351";
const BODY =
  "Lectures were clear and the problem sets matched the exams closely. Office hours were worth it.";
const HELD =
  "A person will look at this first. That usually takes a few days. You can edit it while it waits.";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Signs in as a test person and lands on `path`. */
async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await expect(
    page.getByRole("link", { name: `Account: ${name}` }),
  ).toBeVisible();
}

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
}

/**
 * Deletes this person's reviews left by an earlier local run (local D1
 * keeps them), from the page, so the request is same-origin.
 */
async function deleteMyReviews(page: Page) {
  await page.evaluate(async () => {
    const post = (path: string, body: unknown) =>
      fetch(`/api/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    const { reviews } = (await post("reviews/mine", {})) as {
      reviews: { id: string }[];
    };
    for (const { id } of reviews)
      await post("reviews/delete", { reviewId: id });
  });
}

test("anyone can find a course and read an instructor's numbers", async ({
  page,
}) => {
  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "Terpsicle Reviews", level: 1 }),
  ).toBeVisible();
  await hydrated(page);
  await page.getByPlaceholder(/Find a course/).fill("cmsc 351");
  await page.getByRole("link", { name: /CMSC351\s*Algorithms/ }).click();

  await expect(
    page.getByRole("heading", { name: "CMSC351 · Algorithms", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("grade-bars")).toBeVisible();
  await page.getByRole("link", { name: "Keiko Ashdown" }).click();

  await expect(page).toHaveURL(
    /\/reviews\/instructors\/ashdown_keiko\?course=CMSC351$/,
  );
  await expect(
    page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("rating-math")).toHaveText(
    "from 142 reviews on PlanetTerp",
  );
  // PlanetTerp's words stay on PlanetTerp: a credited link, never the text.
  await expect(
    page.getByRole("link", { name: /142 reviews on PlanetTerp/ }),
  ).toHaveAttribute("href", "https://planetterp.com/professor/ashdown_keiko");
  await expect(
    page.getByText("No reviews of CMSC351 on Terpsicle yet.", { exact: false }),
  ).toBeVisible();

  // Phones: nothing runs off the side.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("write, fix, edit and delete a review", async ({ page, isMobile }) => {
  test.skip(isMobile, "one writer: the desktop run");
  await signIn(page, "Test Student", INSTRUCTOR);
  await deleteMyReviews(page);
  await page.reload();

  await page.getByRole("button", { name: "Write a review" }).click();
  const form = page.getByRole("form", { name: "Write a review" });
  await form.getByRole("radio", { name: "4 stars" }).click();
  // The newest term in the list.
  await form.getByLabel("When you took it").selectOption({ index: 1 });
  await form
    .getByLabel("Your review")
    .fill(`${BODY} Notes: https://example.com/351`);
  await form.getByRole("button", { name: "Post review" }).click();
  // Stage 0, in place and specific; nothing was sent.
  await expect(
    form.getByText("Take out the link. Reviews can only link to umd.edu."),
  ).toBeVisible();

  await form.getByLabel("Your review").fill(BODY);
  await expect(form.getByText(/Take out the link/)).toHaveCount(0);
  await form.getByRole("button", { name: "Post review" }).click();

  // Held for a person (no model in mock mode). The toast says what's next.
  await expect(page.getByText(HELD)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("form", { name: "Write a review" })).toHaveCount(
    0,
  );

  // /reviews/mine: where it stands, only for the writer. (The Worker has no
  // PlanetTerp files in mock mode, so it files the review under a minted
  // instructor id, not the page's; in production the slug matches and the
  // card shows on the instructor's page too.)
  await page.goto("/reviews/mine");
  const mine = page.locator("article[data-review]");
  await expect(mine).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Keiko Ashdown" })).toBeVisible();
  await expect(mine.getByText("Waiting")).toBeVisible();
  await expect(mine.getByText(HELD)).toBeVisible();
  await expect(
    mine.getByText(/^Took it (Spring|Summer|Fall|Winter) \d{4}$/),
  ).toBeVisible();

  // Edit it while it waits.
  await mine.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: "Edit your review" });
  await expect(edit.getByLabel("Your review")).toHaveValue(BODY);
  await edit.getByLabel("Your review").fill(`${BODY} The curve was fair.`);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(mine.getByText(/The curve was fair\./)).toBeVisible({
    timeout: 20_000,
  });

  // Delete: gone at once, Undo brings it back, and nothing asks first.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("article[data-review]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("article[data-review]")).toHaveCount(1);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Review deleted")).toBeVisible();
  // Once the toast has gone, the server has it.
  await expect(page.getByText("Review deleted")).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.reload();
  await expect(
    page.getByText("You haven't written any reviews yet.", { exact: false }),
  ).toBeVisible();
});

test("reporting asks for a sign-in, then sends the reason", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same form on phones");
  // Nothing publishes without Workers AI, so the list answers with one
  // review here; the report itself goes to the real server, which says the
  // review isn't up.
  await page.route("**/api/reviews/list", (route) =>
    route.fulfill({
      json: {
        reviews: [
          {
            id: "e2eReviewNotPosted0001",
            course: "CMSC351",
            termId: null,
            rating: 2,
            grade: null,
            body: "Exams covered things lectures never did. Start the projects early.",
            createdMonth: "2026-10",
            edited: false,
          },
        ],
        next: null,
      },
    }),
  );
  await page.goto(INSTRUCTOR);
  await page.getByRole("button", { name: "Report" }).click();
  await expect(
    page.getByText("Sign in with your UMD account to report a review.", {
      exact: false,
    }),
  ).toBeVisible();

  await signIn(page, "Test Classmate", INSTRUCTOR);
  await page.getByRole("button", { name: "Report" }).click();
  const form = page.getByRole("form", { name: "Report this review" });
  await form.getByRole("radio", { name: "Names a student" }).click();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(form.getByText("This review's gone already.")).toBeVisible();
});

test("course details in the scheduler link to the instructor's reviews", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the scheduler's own drawer flows cover phones");
  await page.goto("/schedule?demo=1");
  await expect(
    page.getByRole("button", { name: /^CMSC351 0301/ }).first(),
  ).toBeVisible();
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search courses" });
  await expect(box).toBeFocused();
  await box.fill("cmsc 351");
  await page.locator('[data-course-result="CMSC351"]').click();
  await expect(page.getByRole("heading", { name: "Algorithms" })).toBeVisible();
  // Keiko Ashdown's group, the open one (the plan has her 0301).
  await page.getByRole("button", { name: "Reviews" }).last().click();
  const read = page.getByRole("link", { name: "Read reviews" }).first();
  await expect(read).toHaveAttribute(
    "href",
    /^\/reviews\/instructors\/[^?]+\?course=CMSC351$/,
  );
  await read.click();
  await expect(page).toHaveURL(
    /\/reviews\/instructors\/ashdown_keiko\?course=CMSC351$/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const)
  test(`the Reviews pages pass axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of [
      "/reviews",
      "/reviews/courses/CMSC351",
      INSTRUCTOR,
      "/reviews/policy",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect
        .soft(
          violations.map((v) => ({
            rule: v.id,
            nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 4),
          })),
          `axe: ${path} (${scheme})`,
        )
        .toEqual([]);
    }
  });
