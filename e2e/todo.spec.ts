import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { newYorkClock } from "../src/core/todo/list";
import {
  TEST_FEED_TOKENS,
  testFeedIcs,
  testFeedLink,
} from "../src/core/todo/test-feed";
import { signInNewUser } from "./test-user";
import { liveToasts } from "./toasts";

// Terpsicle Todo's calendar (docs/V3.md §3.9) on `pnpm dev:mock`: test-mode
// sign-in, and the Worker's fixture feeds (TEST_FEED_TOKENS) in place of
// ELMS. Every test has a fresh account, so feeds, tasks and preferences
// are isolated across workers and retries.

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
    .exclude("[data-floating]")
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

/** A date `days` from `date`, as the URL and date fields take it. */
function shift(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** New York's date today. */
const today = () => newYorkClock(Date.now()).date;

/** The bar: the week, with ELMS's line under it, and the sync cloud. */
const elms = (page: Page) => page.getByRole("banner");

/**
 * Opens Todo's sync from the bar's cloud: ELMS's and the account's syncs,
 * Sync now, and ELMS's link. A popover on a desktop, a sheet on a phone.
 */
async function openElms(page: Page) {
  await elms(page).getByRole("button", { name: "Sync" }).click();
  const dialog = page.getByRole("dialog", { name: "Sync" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** On a phone, raises the drawer to half, where the sidebar's sections show. */
async function raiseDrawer(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  const drawer = page.locator("[data-workbench-drawer]");
  await expect(drawer).toBeVisible({ timeout: 20_000 });
  if ((await drawer.getAttribute("data-snap")) !== "peek") return;
  await page.getByRole("button", { name: "Raise the panel" }).tap();
  await expect(drawer).toHaveAttribute("data-snap", "half");
}

/** The whole week's bar: the sidebar's, or the drawer's strip on a phone. */
const weekBar = (page: Page) =>
  page.getByRole("progressbar", { name: /, every course$/ });

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

test("connect ELMS, check things off on the week as its bars fill, move around, disconnect with Undo", {
  tag: "@critical",
}, async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  await signInNewUser(page, "/todo");

  // The first visit: the empty week, what lands there, and its two ways in.
  await expect(page.getByText(/^Your deadlines, on a calendar/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ – /);
  await expect(elms(page)).toContainText("ELMS isn't connected");
  await axe(page, "first visit");

  // The first visit's Connect ELMS opens the sync's paste.
  await page
    .getByRole("main")
    .getByRole("button", { name: "Connect ELMS" })
    .click();
  const connect = page.getByRole("dialog", { name: "Sync" });
  await expect(connect).toBeVisible();
  const link = connect.getByLabel("ELMS calendar link");
  const submit = connect.getByRole("button", { name: "Connect ELMS" });
  // Once the popover's pop-in has settled.
  await expect
    .poll(async () => (await link.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(isMobile ? 44 : 32);
  await axe(page, "connect ELMS");
  await link.fill("https://elms.umd.edu/calendar");
  await submit.click();
  await expect(
    connect.getByText(/That isn't an ELMS calendar link/),
  ).toBeVisible();

  await link.fill(testFeedLink(TEST_FEED_TOKENS.gone));
  await submit.click();
  // Test mode's gone link answers 404: the reset-link sentence.
  await expect(
    connect.getByText(/^ELMS doesn't know that link anymore/),
  ).toBeVisible();
  await expect(link).toHaveValue("");

  await link.fill(testFeedLink(TEST_FEED_TOKENS.calendar));
  await submit.click();
  // Connected: it closes, and the sidebar says when ELMS last synced.
  await expect(connect).toBeHidden();
  await expect(elms(page)).toContainText(/ELMS synced (just now|1 minute ago)/);
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

  // The week's bar fills by one as it's checked off.
  const bar = weekBar(page);
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  const total = Number(await bar.getAttribute("aria-valuemax"));
  expect(total).toBeGreaterThanOrEqual(2);
  await project.click();
  await expect(bar).toHaveAttribute("aria-valuenow", "1");
  await expect(bar).toHaveAttribute("aria-valuetext", `1 of ${total} done`);
  // A check has Undo, like every change: it comes back, then goes again.
  await expect(page.getByText("Marked Project 2 done")).toBeVisible();
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await expect(project).not.toBeChecked();
  await project.click();
  await expect(bar).toHaveAttribute("aria-valuenow", "1");

  // Done marks are the server's: they survive a reload.
  await page.reload();
  await expect(project).toBeChecked();
  await expect(weekBar(page)).toHaveAttribute("aria-valuenow", "1");

  // Each week is a URL that Back and a copied link keep.
  const title = await page.getByRole("heading", { level: 1 }).textContent();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Ahead a week" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    title ?? "",
  );
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
  if (!isMobile) {
    // Keys: N ahead, T back to today's week.
    // On a day's name, not the space under it (that starts a task).
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("n");
    await expect(page).toHaveURL(/date=/);
    await page.keyboard.press("t");
    await expect(page).toHaveURL(/\/todo$/);
  }

  // An old link to the month or the list opens the week.
  await page.goto("/todo?view=month");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/ – /);
  await expect(page.getByRole("checkbox").first()).toBeVisible();

  // ?day= opens that day's week (the due-tomorrow push links there).
  await page.goto(`/todo?day=${today()}`);
  await expect(elms(page)).toContainText("ELMS synced");

  // Disconnect: at once, Undo in the toast, no dialog.
  const settings = await openElms(page);
  await settings
    .getByRole("link", { name: "Disconnect or add a file" })
    .click();
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
  await page.goto(`/todo?date=${shift(today(), 1)}`);
  await expect(page.getByText("Project 2")).toBeVisible();
  await expect(elms(page)).toContainText("ELMS isn't connected");
  const offer = await openElms(page);
  await expect(
    offer.getByText(/Some deadlines came from a file/),
  ).toBeVisible();
  expect(await post(page, "todo/import-file", { items: [] })).toBe(200);
});

test("ELMS's settings sync now and take a new link", async ({ page }) => {
  await signInNewUser(page, "/todo");
  expect(
    await post(page, "todo/connect", {
      url: testFeedLink(TEST_FEED_TOKENS.calendar),
    }),
  ).toBe(200);
  await page.reload();
  await expect(elms(page)).toContainText("ELMS synced");
  const settings = await openElms(page);
  await expect(settings.getByText(/^Synced /)).toBeVisible();
  await axe(page, "sync");
  // Just connected: ELMS was read moments ago, and says so.
  await settings.getByRole("button", { name: "Sync now" }).click();
  await expect(
    settings.getByText("ELMS was synced in the last 5 minutes."),
  ).toBeVisible();
  // The same link again, as a new one: it takes it, and closes.
  await settings
    .getByLabel("ELMS calendar link")
    .fill(testFeedLink(TEST_FEED_TOKENS.calendar));
  await settings.getByRole("button", { name: "Save the new link" }).click();
  await expect(settings).toBeHidden();
  await expect(elms(page)).toContainText("ELMS synced");
  expect(await post(page, "todo/disconnect")).toBe(200);
});

test("each course's bar for the week, and hiding a course with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  await signInNewUser(page, "/todo");
  expect(
    await post(page, "todo/connect", {
      url: testFeedLink(TEST_FEED_TOKENS.calendar),
    }),
  ).toBe(200);
  // The week Reading response 3 (ENGL101, in three days) is in.
  await page.goto(`/todo?date=${shift(today(), 3)}`);
  await expect(page.getByText("Reading response 3").first()).toBeVisible();
  await raiseDrawer(page, isMobile);

  // Each course: its words and its bar, in its color.
  const courses = page.getByRole("list", { name: "Courses" });
  const engl = courses.getByRole("listitem", { name: "ENGL101" });
  await expect(engl.getByText("0 of 1 done")).toBeVisible();
  await expect(
    engl.getByRole("progressbar", { name: "ENGL101 this week" }),
  ).toHaveAttribute("aria-valuetext", "0 of 1 done");
  await axe(page, "the week's bars");

  // Hide a course from its row: its items go, with Undo.
  const before = Number(await weekBar(page).getAttribute("aria-valuemax"));
  await engl.getByRole("button", { name: "Hide ENGL101" }).click();
  await expect(engl.getByText("Hidden everywhere in Todo")).toBeVisible();
  await expect(weekBar(page)).toHaveAttribute(
    "aria-valuemax",
    String(before - 1),
  );
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(weekBar(page)).toHaveAttribute("aria-valuemax", String(before));

  // Hidden again, it stays hidden: it's the account's, like done marks.
  await engl.getByRole("button", { name: "Hide ENGL101" }).click();
  await expect(engl.getByText("Hidden everywhere in Todo")).toBeVisible();
  await page.reload();
  await raiseDrawer(page, isMobile);
  await expect(engl.getByText("Hidden everywhere in Todo")).toBeVisible();
  await expect(page.getByText("Reading response 3")).toHaveCount(0);
  await engl.getByRole("button", { name: "Show ENGL101" }).click();
  await expect(page.getByText("Reading response 3").first()).toBeVisible();
  expect(await post(page, "todo/disconnect")).toBe(200);
});

test("add tasks in plain words, change one, delete it with Undo", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  await signInNewUser(page, "/todo");

  // Without ELMS, the first visit's "Add a task" focuses the sidebar's composer.
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add a task", exact: true })
    .click();
  const composer = page.getByRole("textbox", { name: "New task" });
  await expect(composer).toBeFocused();
  await composer.fill("Email my advisor");
  await composer.press("Enter");
  // No date: under No date, right under the composer, which is ready again.
  const noDate = page.getByRole("region", { name: "No date" });
  await expect(noDate.getByText("Email my advisor")).toBeVisible();
  await expect(composer).toHaveValue("");

  // The date and time read from the words, marked, and filled in below.
  await composer.fill("Office hours tomorrow 3pm");
  const dateField = page
    .getByRole("region", { name: "Add task" })
    .getByLabel("Due date");
  await expect(dateField).toHaveValue(shift(today(), 1));
  await expect(
    page.getByRole("region", { name: "Add task" }).getByLabel("Time"),
  ).toHaveValue("15:00");
  await expect(page.locator("mark")).toHaveText(["tomorrow", "3pm"]);
  await axe(page, "the composer");
  await composer.press("Enter");

  // It lands on tomorrow, in tomorrow's week.
  const tomorrow = shift(today(), 1);
  await page.goto(`/todo?date=${tomorrow}`);
  const day = page.locator(`#day-${tomorrow}`);
  await expect(day.getByText("Office hours")).toBeVisible();

  // A day's + (a desktop's empty space under its cards) starts a task there.
  const other = shift(today(), 2);
  await page.goto(`/todo?date=${other}`);
  await page
    .getByRole("button", {
      name: new RegExp(`^Add a task on .+ ${Number(other.slice(8))}$`),
    })
    .click();
  await expect(composer).toBeFocused();
  await expect(dateField).toHaveValue(other);
  await page.keyboard.press("Escape");

  // Change it from its details: a new title, and no date.
  await page.goto(`/todo?date=${tomorrow}`);
  if (isMobile)
    await day.getByRole("button", { name: "Office hours options" }).click();
  else {
    await day.getByRole("button", { name: "Office hours, details" }).click();
    await page.getByRole("button", { name: "Office hours options" }).click();
  }
  await page.getByRole("menuitem", { name: "Edit" }).click();
  // In the row's place on a phone, in the details on a desktop.
  const editor = isMobile ? day : page.getByRole("dialog");
  const title = editor.getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await title.fill("Office hours, bring Project 2");
  await editor.getByLabel("Due date").fill("");
  await editor.getByRole("button", { name: "Save" }).click();
  await raiseDrawer(page, isMobile);
  await expect(noDate.getByText("Office hours, bring Project 2")).toBeVisible();

  // Delete: at once, no dialog, and Undo puts it back.
  await noDate
    .getByRole("button", { name: "Office hours, bring Project 2 options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(noDate.getByText("Office hours, bring Project 2")).toHaveCount(
    0,
  );
  await expect(
    liveToasts(page).getByText("Deleted Office hours, bring Project 2"),
  ).toBeVisible();
  // No dialog (a phone's drawer is one, and stays).
  await expect(
    page.locator('[role="dialog"]:not([data-workbench-drawer])'),
  ).toHaveCount(0);
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(noDate.getByText("Office hours, bring Project 2")).toBeVisible();
  await page.reload();
  await raiseDrawer(page, isMobile);
  await expect(noDate.getByText("Office hours, bring Project 2")).toBeVisible();
});

test("the check that finishes the week sends confetti off its bar, once", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await signInNewUser(page, "/todo");
  // Two of your own tasks today, one already done.
  const day = today();
  for (const [uid, title] of [
    ["own-confetti-aaaa1", "Lab 5"],
    ["own-confetti-aaaa2", "Quiz 3"],
  ])
    expect(
      await post(page, "todo/save-task", {
        uid,
        title,
        courseCode: "CMSC216",
        dueDate: day,
        dueTime: null,
      }),
    ).toBe(200);
  expect(
    await post(page, "todo/done", { uid: "own-confetti-aaaa1", done: true }),
  ).toBe(200);
  await page.goto("/todo");
  await expect(weekBar(page)).toHaveAttribute("aria-valuetext", "1 of 2 done");

  const confetti = page.locator("canvas[data-confetti]");
  await page.getByRole("checkbox", { name: "Done: Quiz 3" }).first().click();
  await expect(weekBar(page)).toHaveAttribute("aria-valuetext", "All 2 done");
  // Off the week's bar, over the page without taking a click, then gone.
  await expect(confetti).toHaveCount(1);
  await expect(confetti).toHaveAttribute("aria-hidden", "true");
  await expect(confetti).toHaveCSS("pointer-events", "none");
  await expect(confetti).toHaveCount(0, { timeout: 5_000 });

  // A week that opens done sends none.
  await page.reload();
  await expect(weekBar(page)).toHaveAttribute("aria-valuetext", "All 2 done");
  await page.waitForTimeout(1_000);
  await expect(confetti).toHaveCount(0);
});

test("weeks start on Monday, whatever an account saved before", async ({
  page,
}) => {
  await signInNewUser(page, "/todo");
  // A Wednesday.
  await page.goto("/todo?date=2026-09-30");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^Sep 28 – Oct 4/,
  );
  await expect(page.getByRole("radio", { name: "Sunday" })).toHaveCount(0);
});

test.describe("the sidebar", () => {
  test.skip(({ isMobile }) => isMobile, "Phones have the drawer");

  test("is resizable like Schedule's and Plan's, and keeps its width", async ({
    page,
  }) => {
    await signInNewUser(page, "/todo");
    const aside = page.getByRole("complementary", { name: "Sidebar" });
    await expect(aside).toBeVisible();
    const handle = page.getByRole("separator", { name: "Sidebar width" });
    await handle.dblclick();
    await expect(handle).toHaveAttribute("aria-valuenow", "360");
    const start = (await aside.boundingBox())?.width ?? 0;
    expect(Math.round(start)).toBe(360);
    // Dragged 60px wider.
    const box = await handle.boundingBox();
    if (!box) throw new Error("no handle");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, y, { steps: 6 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-valuenow", "420");
    await expect
      .poll(async () => Math.round((await aside.boundingBox())?.width ?? 0))
      .toBe(420);
    // The one width every workbench shares, kept for next time.
    await page.reload();
    await expect(
      page.getByRole("separator", { name: "Sidebar width" }),
    ).toHaveAttribute("aria-valuenow", "420");
    // Schedule reads it from the prefs it keeps, where Todo saved it.
    await page.goto("/schedule?demo=1");
    await expect(
      page.getByRole("separator", { name: "Sidebar width" }),
    ).toHaveAttribute("aria-valuenow", "420", { timeout: 20_000 });
  });
});
