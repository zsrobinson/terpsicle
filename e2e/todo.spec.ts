import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { listRange, newYorkClock } from "../src/core/todo/list";
import {
  TEST_FEED_TOKENS,
  testFeedIcs,
  testFeedLink,
} from "../src/core/todo/test-feed";
import { liveToasts } from "./toasts";

// Terpsicle Todo's calendar (docs/V3.md §3.9) on `pnpm dev:mock`: test-mode
// sign-in, and the Worker's fixture feeds (TEST_FEED_TOKENS) in place of
// ELMS. Each project signs in as its own person so the two never share a
// feed (e2e/todo-api.spec.ts uses the third, Test Admin).
//
// Within a project every signed-in test is that one person, changing their
// feed, own tasks and hidden courses, so this file's tests run one after
// another in one worker (the config is fully parallel elsewhere).
test.describe.configure({ mode: "default" });

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
  // Start from nothing: no feed, no file items and no own tasks from an
  // earlier run.
  expect(await post(page, "todo/disconnect")).toBe(200);
  expect(await post(page, "todo/import-file", { items: [] })).toBe(200);
  await showHiddenCourses(page);
  await deleteOwnTasks(page);
  await page.reload();
}

/** Shows every course hidden in an earlier run. */
async function showHiddenCourses(page: Page) {
  const today = newYorkClock(Date.now()).date;
  const hidden = await page.evaluate(async (range) => {
    const response = await fetch("/api/todo/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(range),
    });
    return ((await response.json()) as { hidden: string[] }).hidden;
  }, listRange(today));
  for (const key of hidden)
    expect(await post(page, "todo/hide-course", { key, hidden: false })).toBe(
      200,
    );
}

/** Deletes the person's own tasks: the ones with no date, and any in the list's range. */
async function deleteOwnTasks(page: Page) {
  const today = newYorkClock(Date.now()).date;
  const uids = await page.evaluate(async (range) => {
    const response = await fetch("/api/todo/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(range),
    });
    const list = (await response.json()) as {
      items: { uid: string; source: string }[];
    };
    return list.items.filter((i) => i.source === "own").map((i) => i.uid);
  }, listRange(today));
  for (const uid of uids)
    expect(await post(page, "todo/delete-task", { uid })).toBe(200);
}

/** A date `days` from `date`, as the URL and date fields take it. */
function shift(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** New York's date today. */
const today = () => newYorkClock(Date.now()).date;

/** A phone's sheet of adding a task, the courses and ELMS. */
const panelSheet = (page: Page) =>
  page.getByRole("dialog", { name: "Add a task, courses and ELMS" });

/**
 * On a phone, the side panel (adding a task, the courses, ELMS, the week's
 * start) is a sheet the bar opens: opens it.
 */
async function openPanel(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  if (await panelSheet(page).isVisible()) return;
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Courses and ELMS" })
    .click();
  await expect(panelSheet(page)).toBeVisible();
}

/** Closes a phone's panel sheet, so the page behind is the page again. */
async function closePanel(page: Page, isMobile: boolean) {
  if (!isMobile || !(await panelSheet(page).isVisible())) return;
  await page.keyboard.press("Escape");
  await expect(panelSheet(page)).toBeHidden();
}

/**
 * Week, Month or List: the bar's view switch on a desktop, its calendar
 * sheet on a phone.
 */
async function showView(page: Page, isMobile: boolean, name: string) {
  if (isMobile) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Views and dates" })
      .click();
    await page
      .getByRole("menuitemradio", { name: new RegExp(`^${name}`) })
      .click();
    return;
  }
  await page
    .getByRole("navigation", { name: "Todo views" })
    .getByRole("link", { name })
    .click();
}

/** Ahead a week: the bar's arrow on a desktop, its calendar sheet on a phone. */
async function aheadAWeek(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Views and dates" })
      .click();
    await page.getByRole("menuitem", { name: /^Ahead a week/ }).click();
    return;
  }
  await page.getByRole("link", { name: "Ahead a week" }).click();
}

test("signed out, /todo is the front door", async ({ page }) => {
  await page.goto("/todo");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your deadlines, on a calendar",
    }),
  ).toBeVisible();
  // What Todo does, said before signing in, over a sample week.
  await expect(
    page.getByText(/Connect ELMS and your assignments and quizzes/),
  ).toBeVisible();
  await expect(page.getByText(/^A week in Todo/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in (test mode)" }),
  ).toBeVisible();
  await axe(page, "front door");
});

test("connect ELMS, check things off on the week, move around, disconnect with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  await signIn(page, isMobile);

  // The first visit: what Todo does, its two ways in, and the week it fills.
  await expect(
    page.getByRole("heading", { name: "Your deadlines, on a calendar" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect ELMS" }),
  ).toHaveAttribute("href", "/todo/connect");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ – /);
  await axe(page, "first visit");

  await openPanel(page, isMobile);
  const link = page.getByLabel("ELMS calendar link");
  const connect = page.getByRole("button", { name: "Connect ELMS" });
  expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
    isMobile ? 44 : 32,
  );
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
  await expect(page.locator("body")).not.toContainText(
    TEST_FEED_TOKENS.calendar,
  );
  // Nothing marks an exam or Gradescope any more.
  await expect(page.getByText("Gradescope", { exact: true })).toHaveCount(0);

  // The week Project 2 (due tomorrow) is in.
  await page.goto(`/todo?date=${shift(today(), 1)}`);
  const project = page.getByRole("checkbox", { name: "Done: Project 2" });
  await expect(project).toBeVisible();
  await axe(page, "week");

  // Phones get a 44px target.
  const box = await page.locator("label", { has: project }).boundingBox();
  if (isMobile) expect(box?.height).toBeGreaterThanOrEqual(44);

  await project.click();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  // A check has Undo, like every change: it comes back, then goes again.
  await expect(page.getByText("Marked Project 2 done")).toBeVisible();
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/^6 open · /)).toBeVisible();
  await expect(project).not.toBeChecked();
  await project.click();
  await expect(page.getByText(/^5 open · /)).toBeVisible();

  // Done marks are the server's: they survive a reload.
  await page.reload();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await expect(project).toBeChecked();

  // Each view, and each week, is a URL that Back and a copied link keep.
  await showView(page, isMobile, "Month");
  await expect(page).toHaveURL(/view=month/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^[A-Z][a-z]+ \d{4}$/,
  );
  await axe(page, "month");
  await showView(page, isMobile, "List");
  await expect(page).toHaveURL(/view=list/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Everything due" }),
  ).toBeVisible();
  await axe(page, "list");
  await showView(page, isMobile, "Week");
  await expect(page).toHaveURL(/view=week/);
  const title = await page.getByRole("heading", { level: 1 }).textContent();
  await aheadAWeek(page, isMobile);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    title ?? "",
  );
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
  if (!isMobile) {
    // Keys: M for the month, T for today's, W back to the week.
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("m");
    await expect(page).toHaveURL(/view=month/);
    await page.keyboard.press("w");
    await expect(page).toHaveURL(/view=week/);
  }

  // ?day= opens that day's week (the due-tomorrow push links there).
  await page.goto(`/todo?day=${today()}`);
  await expect(page.getByText(/^5 open · /)).toBeVisible();

  // Disconnect: at once, Undo in the toast, no dialog.
  await openPanel(page, isMobile);
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
  await page.getByTitle("Choose a calendar file (.ics)").setInputFiles({
    name: "deadlines.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(testFeedIcs(today())),
  });
  await expect(
    page.getByText("Added 6 deadlines from the file."),
  ).toBeVisible();
  await page.goto("/todo?view=list");
  await expect(page.getByText("From a file").first()).toBeVisible();
  await expect(page.getByText(/^6 open$/)).toBeVisible();
  await openPanel(page, isMobile);
  await expect(page.getByText(/Some deadlines came from a file/)).toBeVisible();
  expect(await post(page, "todo/import-file", { items: [] })).toBe(200);
});

test("each course's week, and hiding a course with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  await signIn(page, isMobile);
  expect(
    await post(page, "todo/connect", {
      url: testFeedLink(TEST_FEED_TOKENS.calendar),
    }),
  ).toBe(200);
  await page.goto("/todo");
  await expect(page.getByText(/^6 open · /)).toBeVisible();
  await openPanel(page, isMobile);

  // The chart: every course, its week in words, and its last four weeks.
  const courses = page.getByRole("list", { name: "Courses" });
  const engl = courses.getByRole("listitem", { name: "ENGL101" });
  await expect(engl).toBeVisible();
  await expect(
    courses.getByRole("img", { name: /^CMSC216 by week: week of / }),
  ).toBeVisible();
  await axe(page, "the courses' weeks");

  // Hide a course from its row: its items go, with Undo.
  await engl.getByRole("button", { name: "Hide ENGL101" }).click();
  await expect(engl.getByText("Hidden everywhere in Todo")).toBeVisible();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/^6 open · /)).toBeVisible();

  // Hidden again, it stays hidden: it's the account's, like done marks.
  await engl.getByRole("button", { name: "Hide ENGL101" }).click();
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await page.goto("/todo?view=list");
  await expect(page.getByText(/^5 open · /)).toBeVisible();
  await expect(page.getByText("Reading response 3")).toHaveCount(0);
  await openPanel(page, isMobile);
  await courses
    .getByRole("listitem", { name: "ENGL101" })
    .getByRole("button", { name: "Show ENGL101" })
    .click();
  await expect(page.getByText("Reading response 3")).toBeVisible();
  expect(await post(page, "todo/disconnect")).toBe(200);
});

test("add tasks in plain words, change one, delete it with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  await signIn(page, isMobile);

  // Without ELMS, the first visit's "Add a task" goes to the composer (on
  // a phone, in the sheet the bar opens).
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add a task", exact: true })
    .click();
  const composer = page.getByRole("textbox", { name: "New task" });
  await expect(composer).toBeFocused();
  await composer.fill("Email my advisor");
  await composer.press("Enter");
  // A phone's sheet closes on the add, to show the task.
  if (isMobile) await expect(panelSheet(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: "No date" })).toBeVisible();
  await expect(page.getByText("Email my advisor")).toBeVisible();

  // The date and time read from the words, marked, and shown as chips.
  if (isMobile) {
    // The bar's + opens the composer again, with the keyboard.
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Add a task" })
      .click();
    await expect(composer).toBeFocused();
  }
  await composer.fill("Office hours tomorrow 3pm");
  const chips = page.getByRole("list", { name: "The task will be" });
  await expect(chips.getByText("3pm")).toBeVisible();
  await expect(page.locator("mark")).toHaveText(["tomorrow", "3pm"]);
  await axe(page, "the composer");
  await composer.press("Enter");
  if (isMobile) await expect(panelSheet(page)).toBeHidden();
  else await expect(composer).toHaveValue("");

  await page.goto("/todo?view=list");
  const tomorrow = page.getByRole("region", { name: "Tomorrow" });
  await expect(tomorrow.getByText("Office hours")).toBeVisible();
  await expect(tomorrow.getByText("3pm")).toBeVisible();

  if (!isMobile) {
    // An empty day on the week starts a task there.
    const day = shift(today(), 2);
    await page.goto(`/todo?date=${day}`);
    const add = page.getByRole("button", {
      name: new RegExp(`^Add a task on .+ ${Number(day.slice(8))}$`),
    });
    await add.click();
    await expect(page.getByRole("textbox", { name: "New task" })).toBeFocused();
    await expect(page.getByLabel("Due date")).toHaveValue(day);
    await page.goto("/todo?view=list");
  }

  // Change it in place: a new title, and no date.
  await page.getByRole("button", { name: "Office hours options" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await title.fill("Office hours, bring Project 2");
  await page.getByLabel("Due date").last().fill("");
  await page.getByRole("button", { name: "Save" }).click();
  const noDate = page.getByRole("region", { name: "No date" });
  await expect(noDate.getByText("Office hours, bring Project 2")).toBeVisible();

  // Delete: at once, no dialog, and Undo puts it back.
  await page
    .getByRole("button", { name: "Office hours, bring Project 2 options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(noDate.getByText("Office hours, bring Project 2")).toHaveCount(
    0,
  );
  await expect(
    liveToasts(page).getByText("Deleted Office hours, bring Project 2"),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(noDate.getByText("Office hours, bring Project 2")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Office hours, bring Project 2")).toBeVisible();
  await deleteOwnTasks(page);
});

test("weeks start on Monday, or Sunday by the setting", async ({
  page,
  isMobile,
}) => {
  await signIn(page, isMobile);
  // A Wednesday, so both starts are in the same week.
  await page.goto("/todo?date=2026-09-30");
  const heading = page.getByRole("heading", { level: 1 });
  await openPanel(page, isMobile);
  // From Monday, the default, whatever an earlier run left on the account.
  await page.getByRole("radio", { name: "Monday" }).click();
  await closePanel(page, isMobile);
  await expect(heading).toHaveText(/^Sep 28 – Oct 4/);
  await openPanel(page, isMobile);
  await page.getByRole("radio", { name: "Sunday" }).click();
  await closePanel(page, isMobile);
  await expect(heading).toHaveText(/^Sep 27 – Oct 3/);
  // A pref, kept for next time.
  await page.reload();
  await expect(heading).toHaveText(/^Sep 27 – Oct 3/);
  await openPanel(page, isMobile);
  await page.getByRole("radio", { name: "Monday" }).click();
  await closePanel(page, isMobile);
  await expect(heading).toHaveText(/^Sep 28 – Oct 4/);
});
