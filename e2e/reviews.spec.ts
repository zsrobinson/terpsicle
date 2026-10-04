import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { signInNewUser } from "./test-user";
import { liveToasts } from "./toasts";

// Terpsicle Reviews end to end (docs/V2.md §7), on `pnpm dev:mock`: the
// fixtures' PlanetTerp data, the real /api/reviews/* over local D1, and
// test-mode sign-in. Mock mode has no Workers AI, so the moderation check
// can't finish and every new review waits for a person, as it would when
// the model is down: the held state is what a writer sees here.
//
// Keiko Ashdown ("ashdown_keiko", at /reviews/ashdown-keiko) teaches CMSC351
// in the mock term, with 142 PlanetTerp reviews at 3.1; `pnpm dev:mock` seeds
// a few invented ones of them into local D1, as the nightly job would.

const INSTRUCTOR = "/reviews/ashdown-keiko?course=CMSC351";
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

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
}

test("anyone can find a course or an instructor and read their reviews", async ({
  page,
}) => {
  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", {
      name: "Terpsicle Reviews",
      level: 1,
    }),
  ).toBeVisible();
  await hydrated(page);
  const search = page.getByRole("combobox", {
    name: "Search instructors and courses",
  });
  // Instructors and courses are found alike, in the search's results.
  await search.fill("ashdown");
  const results = page.getByRole("listbox");
  await expect(
    results.getByRole("group", { name: "Instructors" }).getByRole("option", {
      name: /Keiko Ashdown/,
    }),
  ).toHaveAttribute("href", "/reviews/ashdown-keiko");
  await search.fill("cmsc 351");
  await results
    .getByRole("group", { name: "Courses" })
    .getByRole("option", { name: /CMSC351\s*Algorithms/ })
    .click();

  await expect(page).toHaveURL(/\/reviews\/cmsc351$/);
  await expect(
    page.getByRole("heading", { name: "CMSC351 Algorithms", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("grade-bars")).toBeVisible();
  await page.getByRole("link", { name: "Keiko Ashdown" }).first().click();

  await expect(page).toHaveURL(/\/reviews\/ashdown-keiko\?course=CMSC351$/);
  await expect(
    page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  // PlanetTerp's 142, and ours from the published numbers (the mock bucket
  // has some for her) while the page shows one course: the count, with no
  // source named (owner, 2026-09-29), and stars filled to the number.
  await expect(page.getByTestId("rating-math")).toContainText(
    /^from 1\d\d reviews$/,
  );
  await expect(
    page.getByRole("img", { name: /^3\.\d out of 5 stars$/ }).first(),
  ).toBeVisible();
  // PlanetTerp's reviews are here, each marked and linking to PlanetTerp.
  const theirs = page.locator('article[data-source="planetterp"]');
  await expect(theirs.first()).toBeVisible();
  await expect(
    theirs.first().getByRole("link", { name: "PlanetTerp" }),
  ).toHaveAttribute("href", "https://planetterp.com/professor/ashdown_keiko");

  // Phones: nothing runs off the side.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an instructor PlanetTerp doesn't know opens a page of what they taught", async ({
  page,
}) => {
  // Dario Castellano teaches CMSC426 in the mock term; PlanetTerp's mock
  // data doesn't join his name, so only our instructor history knows him.
  await page.goto("/reviews/cmsc426");
  await hydrated(page);
  await page.getByRole("link", { name: "Dario Castellano" }).first().click();
  await expect(page).toHaveURL(/\/reviews\/dario-castellano\?course=CMSC426$/);
  await expect(
    page.getByRole("heading", { name: "Dario Castellano", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Nobody's reviewed Dario Castellano yet.", { exact: false }),
  ).toBeVisible();
  const taught = page.getByRole("list", { name: /^Taught in / }).first();
  await expect(taught.getByRole("link", { name: /CMSC426/ })).toHaveAttribute(
    "href",
    "/reviews/cmsc426",
  );
  // Signed out, the box asks, as on anyone's page.
  await expect(
    page.getByRole("region", { name: "Took a class with Dario Castellano?" }),
  ).toBeVisible();
});

test("write, fix, edit and delete a review", { tag: "@critical" }, async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "one writer: the desktop run");
  await signInNewUser(page, INSTRUCTOR);

  await page.getByRole("button", { name: "Write a review" }).click();
  const form = page.getByRole("form", { name: "Write a review" });
  // Half stars: the slider's arrow keys move by a half.
  const rating = form.getByRole("slider", { name: "Rating" });
  await rating.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await expect(rating).toHaveAttribute("aria-valuetext", "4.5 out of 5 stars");
  // The newest term in the list (after "Rather not say").
  await form.getByLabel("When you took it").click();
  await page.getByRole("option").nth(1).click();
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
  // (Only the toast: once the page refetches, the writer's own card says it
  // too, and a page-wide match would find both.)
  await expect(
    page.getByRole("region", { name: /Notifications/ }).getByText(HELD),
  ).toBeVisible({ timeout: 20_000 });
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
  await expect(mine.getByText("Held")).toBeVisible();
  await expect(
    mine.getByRole("img", { name: "4.5 out of 5 stars" }),
  ).toBeVisible();
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
  await expect(liveToasts(page).getByText("Review deleted")).toBeVisible();
  // Once the toast has gone, the server has it.
  await expect(liveToasts(page).getByText("Review deleted")).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No reviews yet" }),
  ).toBeVisible();
});

test("reporting asks for a sign-in, then sends the reason", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same form on phones");
  // Nothing publishes without Workers AI, so the page's reviews answer with
  // one of ours here; the report itself goes to the real server, which says
  // the review isn't up. The server renders a page's first reviews itself,
  // so this is the page as the browser loads it: after a click from the
  // course.
  await page.route("**/api/reviews/page", (route) =>
    route.fulfill({
      json: {
        terpsicle: [
          {
            id: "e2eReviewNotPosted0001",
            instructorId: "ashdown_keiko",
            course: "CMSC351",
            termId: null,
            rating: 2,
            grade: null,
            body: "Exams covered things lectures never did. Start the projects early.",
            createdMonth: "2026-10",
            edited: false,
          },
        ],
        planetTerp: [],
        next: null,
      },
    }),
  );
  const openFromCourse = async () => {
    await page.getByRole("link", { name: "Keiko Ashdown" }).first().click();
    await expect(page).toHaveURL(/\/reviews\/ashdown-keiko/);
  };
  await page.goto("/reviews/cmsc351");
  await hydrated(page);
  await openFromCourse();
  await page.getByRole("button", { name: "Report" }).click();
  await expect(
    page.getByText("Sign in with your UMD account to report a review.", {
      exact: false,
    }),
  ).toBeVisible();

  await signInNewUser(page, "/reviews/cmsc351");
  await openFromCourse();
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
  // Keiko Ashdown's group, the open one (the plan has her 0301). Its
  // Reviews button wears Reviews' mark and opens a preview over the list.
  const reviews = page.getByRole("button", { name: "Reviews" }).last();
  await expect(reviews.locator('[data-mark="reviews"]')).toBeVisible();
  await reviews.click();
  const preview = page.locator('[data-instructor="Keiko Ashdown"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("reviews on PlanetTerp");
  const read = preview.getByRole("link", { name: "View reviews" });
  await expect(read).toHaveAttribute(
    "href",
    /^\/reviews\/[^/?]+\?course=CMSC351$/,
  );
  await read.click();
  await expect(page).toHaveURL(/\/reviews\/ashdown-keiko\?course=CMSC351$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// One test a page, 4–8 s each on a phone: all seven in one test came to
// 33–37 s, past its 30 s (main, 2026-10-04, both tries), each load waiting
// for the network to go quiet before axe reads it.
for (const scheme of ["light", "dark"] as const)
  for (const path of [
    "/reviews",
    "/reviews?q=CMSC",
    "/reviews/cmsc351",
    INSTRUCTOR,
    "/reviews/keiko-ashdown",
    "/reviews/dario-castellano?course=CMSC426",
    "/reviews/policy",
  ])
    test(`${path} passes axe (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
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
    });
