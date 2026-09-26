import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { alertsHarnessPort } from "../scripts/e2e-checkout";
import { OPEN_VIEW } from "./sidebar";

// Seat watches end to end (SPEC §3.12, V2.md §6.5): signed out, "Watch for a
// seat" on a full section → test-mode sign-in as tstudent → back in the app
// and watching → "Watching" on the section, the calendar block and in
// Problems (the full problem becomes a note) → a seats run reopens it → the
// alert email, with one-click unsubscribe → Stop in Settings, with Undo.
//
// The app is `pnpm dev:mock`; its /api/* calls go to the e2e harness
// (e2e/alerts-harness): the real router and alert code over local D1 and R2,
// with the flag on, test-mode sign-in, and an EMAIL binding that keeps what
// it's sent.

const HARNESS = `http://localhost:${alertsHarnessPort(path.resolve(import.meta.dirname, ".."))}`;
const TO = "tstudent@terpmail.umd.edu";

type Sent = {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

test.skip(({ isMobile }) => isMobile, "desktop flow");

let errors: string[] = [];
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * Sends the page's /api calls to the harness as if it were this origin:
 * same-origin headers for the session routes, and the sign-in redirect
 * pointed back at the app.
 */
async function routeApi(page: Page, appOrigin: string) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${HARNESS}${url.pathname}${url.search}`,
      headers: { ...route.request().headers(), origin: HARNESS },
      maxRedirects: 0,
    });
    const headers = response.headers();
    if (headers.location)
      headers.location = headers.location.replace(HARNESS, appOrigin);
    await route.fulfill({ response, headers });
  });
}

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

async function openCourse(page: Page, query: string, code: string) {
  const box = page.getByRole("combobox", { name: "Search courses" });
  // The rail's Search tab, not "/": after signing in, the page comes back
  // on whatever tab the URL names, with focus wherever the load left it.
  if (!(await box.isVisible())) await openTab(page, "Search");
  await box.fill(query);
  await page.locator(`[data-course-result="${code}"]`).click();
  await expect(page.locator(OPEN_VIEW)).toContainText(code);
}

async function openTab(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}

/** The plan's CMSC351 on 0101, which is full in the mock seats. */
async function takeFullSection(page: Page) {
  await openCourse(page, "cmsc 351", "CMSC351");
  const row = page.locator('[data-section="0101"]');
  await expect(row).toContainText("Full");
  const take = row.getByRole("button", { name: "Switch to 0101" });
  if (await take.isVisible()) await take.click();
  await page.keyboard.press("Escape");
  return row;
}

test("watch a full section: sign in, watching everywhere, the email, stop and undo", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const appOrigin = new URL(baseURL ?? "").origin;
  await routeApi(page, appOrigin);
  await request.post(`${HARNESS}/__test/seed`);
  await request.post(`${HARNESS}/__test/reset`);
  const inbox = async () =>
    (await (
      await request.get(`${HARNESS}/__test/emails?to=${encodeURIComponent(TO)}`)
    ).json()) as Sent[];

  // Signed out, a full section in the plan: Problems offers the watch.
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await takeFullSection(page);
  await openTab(page, "Problems");
  const full = page.getByTestId("problem-full");
  await expect(full).toContainText("CMSC351 0101 is full");
  await full
    .getByRole("button", { name: "Watch for a seat, CMSC351 0101" })
    .click();

  // The sign-in it offers comes back to the app, already watching.
  await expect(page.getByText("Sign in to get seat alerts.")).toBeVisible();
  await page.getByRole("link", { name: "Sign in (test mode)" }).click();
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Account: Test Student" }),
  ).toBeVisible({ timeout: 15_000 });
  // Nothing more to click: the account now watches it. (Its toast can sit
  // behind the first sign-in's own messages, so ask the API.)
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const response = await fetch("/api/alerts/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const list = (await response.json()) as {
            watches?: { sectionKey: string }[];
          };
          return list.watches?.map((w) => w.sectionKey) ?? [];
        }),
      { timeout: 15_000 },
    )
    .toEqual(["CMSC351-0101"]);

  // The first sign-in merges this browser's plans with the account's; wait
  // for that to settle so it doesn't redraw the sidebar under a click.
  await expect(
    page.getByRole("banner").locator("[data-sync-status]"),
  ).toHaveAttribute("data-sync-status", "saved", { timeout: 15_000 });
  // Watching on the section's row, its calendar block and in Problems,
  // where the full problem is now a note.
  const row = await takeFullSection(page);
  await openCourse(page, "cmsc 351", "CMSC351");
  await expect(
    row.getByRole("button", { name: /^Watching CMSC351 0101/ }),
  ).toBeVisible();
  await expect(row).toContainText("Watching");
  await page.keyboard.press("Escape");
  const block = calendar(page).locator(
    '[data-course="CMSC351"][data-watching]',
  );
  await expect(block.first()).toBeVisible();
  await block.first().hover();
  await expect(page.getByRole("tooltip")).toContainText("Watching for a seat");
  await openTab(page, "Problems");
  await expect(page.getByTestId("problem-watching")).toContainText(
    "Watching for a seat in CMSC351 0101",
  );
  await expect(page.getByTestId("problem-full")).toHaveCount(0);

  // A seats run where the section reopens: one email, with one-click stop.
  const reopened = await request.post(`${HARNESS}/__test/reopen`, {
    data: { sectionKey: "CMSC351-0101", open: 3 },
  });
  expect(await reopened.json()).toMatchObject({ sent: 1 });
  const [alert] = await inbox();
  expect(alert?.subject).toBe("3 seats opened in CMSC351 0101");
  expect(alert?.text).toContain("Seats: 3 of 120 open");
  expect(alert?.text).toContain("/settings#watching");
  expect(alert?.headers?.["List-Unsubscribe"]).toMatch(
    /\/api\/alerts\/one-click\?/,
  );
  expect(alert?.headers?.["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );

  // The account menu's Watching list: Stop is immediate, with Undo.
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Account: Test Student" })
    .click();
  await page.getByRole("menuitem", { name: "Watching for a seat" }).click();
  await expect(page).toHaveURL(/\/settings#watching$/);
  const listed = page.getByTestId("seat-watch-CMSC351-0101");
  await expect(listed).toContainText("Last email");
  await listed.getByRole("button", { name: "Stop" }).click();
  await expect(listed).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(listed).toBeVisible();
  await listed.getByRole("button", { name: "Stop" }).click();
  await expect(
    page.getByText("You're not watching any sections."),
  ).toBeVisible();

  // Stopped: the next reopening emails nobody.
  const again = await request.post(`${HARNESS}/__test/reopen`, {
    data: { sectionKey: "CMSC351-0101", open: 5 },
  });
  expect(await again.json()).toMatchObject({ sent: 0 });
});
