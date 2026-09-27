import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { newYorkClock } from "../src/core/todo/list";
import {
  TEST_FEED_TOKENS,
  testFeedIcs,
  testFeedLink,
} from "../src/core/todo/test-feed";
import { liveToasts } from "./toasts";

// Terpsicle Todo's pages (docs/V3.md §3.9) on `pnpm dev:mock`: test-mode
// sign-in, and the Worker's fixture feeds (TEST_FEED_TOKENS) in place of
// ELMS. Each project signs in as its own person so the two never share a
// feed (e2e/todo-api.spec.ts uses the third, Test Admin).

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Axe in both themes (the app follows the system's). */
async function axe(page: Page, what: string) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `${what} (${colorScheme})`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function scan(page: Page, what: string) {
  await page.waitForTimeout(250);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .exclude("[data-radix-popper-content-wrapper]")
    .analyze();
  expect
    .soft(
      violations.map((v) => ({
        rule: v.id,
        nodes: v.nodes.map((n) => n.target.join(" ")),
      })),
      `axe violations: ${what}`,
    )
    .toEqual([]);
}

/** A same-origin POST from the page, as the app makes them. */
function post(page: Page, name: string, body: unknown = {}) {
  return page.evaluate(
    async ([name, body]) => {
      const response = await fetch(`/api/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    [name, body] as const,
  );
}

async function signIn(page: Page, isMobile: boolean) {
  const person = isMobile ? "Test Classmate" : "Test Student";
  await page.goto("/auth/test?return=/todo");
  await page.getByRole("button", { name: `Sign in as ${person}` }).click();
  // Signed in, and `?signed-in=1` already stripped.
  await page.waitForURL((url) => url.pathname === "/todo" && url.search === "");
  // Start from nothing: no feed and no file items from an earlier run.
  expect(await post(page, "todo/disconnect")).toBe(200);
  expect(await post(page, "todo/import-file", { items: [] })).toBe(200);
  await page.reload();
}

test("signed out, /todo is the front door", async ({ page }) => {
  await page.goto("/todo");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your deadlines and exams, in one list",
    }),
  ).toBeVisible();
  // What you'll need after signing in, said before you do.
  await expect(
    page.getByText("Sign in, then paste your ELMS calendar link"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in (test mode)" }),
  ).toBeVisible();
  await axe(page, "front door");
});

test("connect ELMS, check things off, switch views, disconnect with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  await signIn(page, isMobile);

  // Not connected: the first visit, with the paste right under it.
  await expect(
    page.getByRole("heading", {
      name: "Connect ELMS to see your deadlines",
      level: 1,
    }),
  ).toBeVisible();
  const link = page.getByLabel("ELMS calendar link");
  const connect = page.getByRole("button", { name: "Connect ELMS" });
  await axe(page, "not connected");

  await link.fill("https://elms.umd.edu/calendar");
  await connect.click();
  await expect(
    page.getByText(/That isn't an ELMS calendar link/),
  ).toBeVisible();

  await link.fill(testFeedLink(TEST_FEED_TOKENS.gone));
  await connect.click();
  // Test mode's gone link answers 404: the reset-link sentence.
  await expect(
    page.getByText(/^ELMS doesn't know that link anymore/),
  ).toBeVisible();
  await expect(link).toHaveValue("");

  await link.fill(testFeedLink(TEST_FEED_TOKENS.calendar));
  await connect.click();

  // The fixture feed: six items from two days ago to six days ahead.
  const status = page.getByText(/^6 open · ELMS feed checked/);
  await expect(status).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tomorrow" })).toBeVisible();
  const project = page.getByRole("checkbox", { name: "Done: Project 2" });
  await expect(project).toBeVisible();
  await expect(page.getByText("Exam", { exact: true })).toBeVisible();
  await expect(page.getByText("Gradescope", { exact: true })).toBeVisible();
  // Said once, under the first Gradescope item.
  await expect(page.getByText(/^Extensions you get in Gradescope/)).toHaveCount(
    1,
  );
  await expect(page.locator("body")).not.toContainText(
    TEST_FEED_TOKENS.calendar,
  );
  await axe(page, "by day");

  // Phones get a 44px target.
  const box = await page.locator("label", { has: project }).boundingBox();
  if (isMobile) expect(box?.height).toBeGreaterThanOrEqual(44);

  await project.click();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await expect(page.getByRole("button", { name: "1 done" })).toBeVisible();

  // A check has Undo, like every change: it comes back, then goes again.
  await expect(page.getByText("Marked Project 2 done")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/^6 open · /)).toBeVisible();
  await expect(project).not.toBeChecked();
  await project.click();
  await expect(page.getByText(/^5 open · /)).toBeVisible();

  // Done marks are the server's: they survive a reload.
  await page.reload();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await expect(page.getByRole("button", { name: "1 done" })).toBeVisible();

  // Each view is a link: a URL that Back and a copied link keep.
  const views = page.getByRole("navigation", { name: "Todo views" });
  await views.getByRole("link", { name: "By course" }).click();
  await expect(page).toHaveURL(/view=course/);
  await expect(page.getByRole("region", { name: "CMSC216" })).toBeVisible();
  await axe(page, "by course");

  if (!isMobile) {
    await views.getByRole("link", { name: "Week" }).click();
    await expect(page).toHaveURL(/view=week/);
    await expect(page.getByTestId("todo-chip").first()).toBeVisible();
    await axe(page, "week");
  } else {
    await expect(views.getByRole("link", { name: "Week" })).toHaveCount(0);
  }

  // ?day= scrolls to that day (the due-tomorrow push opens it).
  await page.goto(`/todo?day=${newYorkClock(Date.now()).date}`);
  await expect(page.getByText(/^5 open · /)).toBeVisible();

  // Disconnect: at once, Undo in the toast, no dialog.
  await page.getByRole("link", { name: "ELMS link" }).click();
  await expect(page).toHaveURL(/\/todo\/connect$/);
  await expect(
    page.getByRole("heading", { name: "ELMS link", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/ELMS is connected/)).toBeVisible();
  await axe(page, "connect page");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByLabel("ELMS calendar link")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/ELMS is connected/)).toBeVisible();

  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(liveToasts(page).getByText("ELMS disconnected")).toBeVisible();
  await expect(liveToasts(page).getByText("ELMS disconnected")).toBeHidden({
    timeout: 15_000,
  });
  await page.reload();
  await expect(page.getByLabel("ELMS calendar link")).toBeVisible();

  // A calendar file instead: read here, only its items sent.
  const today = newYorkClock(Date.now()).date;
  await page.getByTitle("Choose a calendar file (.ics)").setInputFiles({
    name: "gradescope.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(testFeedIcs(today)),
  });
  await expect(
    page.getByText("Added 6 deadlines from the file."),
  ).toBeVisible();
  await page.goto("/todo");
  await expect(page.getByText(/These came from a file/)).toBeVisible();
  await expect(page.getByText("From a file").first()).toBeVisible();
  await expect(page.getByText(/^6 open$/)).toBeVisible();
  expect(await post(page, "todo/import-file", { items: [] })).toBe(200);
});
