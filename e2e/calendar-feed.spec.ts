import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The calendar feed (V2.md §6.7) on `pnpm dev:mock`, signed in with test
// mode: Subscribe on /settings/notifications, the Apple and Google links, the
// feed itself fetched with no cookie (as a calendar app would) holding an own
// task as a deadline, and "Make a new link" stopping the old one. Each run
// signs in as a fresh person, so desktop and mobile never share a link.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function signIn(page: Page): Promise<void> {
  await page.goto("/settings");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/settings/notifications" }),
    });
    const result: { return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  expect(next).toContain("/settings/notifications");
}

/** Adds an own task due in a week, through Todo's API. */
async function addTask(page: Page, title: string): Promise<void> {
  const status = await page.evaluate(async (t) => {
    const due = new Date(Date.now() + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const response = await fetch("/api/todo/save-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: `own-${crypto.randomUUID()}`,
        title: t,
        courseCode: "CMSC216",
        dueDate: due,
        dueTime: null,
      }),
    });
    return response.status;
  }, title);
  expect(status).toBe(200);
}

const httpUrl = (webcal: string) => webcal.replace(/^webcal:\/\//, "http://");

test("subscribe to the calendar feed, then make a new link", {
  tag: "@critical",
}, async ({ page, playwright }) => {
  await signIn(page);
  await addTask(page, "Lab report");
  await page.goto("/settings/notifications");

  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Calendar feed" }),
  ).toBeVisible();
  await main.getByRole("button", { name: "Subscribe" }).click();

  const apple = main.getByRole("link", { name: "Add to Apple Calendar" });
  await expect(apple).toHaveAttribute(
    "href",
    /^webcal:\/\/localhost:\d+\/cal\/[0-9a-f]{64}\.ics$/,
  );
  const webcal = (await apple.getAttribute("href")) ?? "";
  await expect(
    main.getByRole("link", { name: "Add to Google Calendar" }),
  ).toHaveAttribute(
    "href",
    `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  );
  await expect(
    main.getByRole("button", { name: "Copy the link" }),
  ).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await scan(
      page,
      `notification settings with the calendar feed (${scheme})`,
    );
  }

  // A calendar app: no cookie, no origin.
  const calendarApp = await playwright.request.newContext();
  try {
    const feed = await calendarApp.get(httpUrl(webcal));
    expect(feed.status()).toBe(200);
    expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
    expect(feed.headers()["cache-control"]).toBe("private, max-age=900");
    const body = (await feed.text()).replace(/\r\n /g, "");
    expect(body.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(body).toContain("X-WR-CALNAME:Terpsicle");
    expect(body).toContain("SUMMARY:Due: Lab report (CMSC216)");
    expect(body).toContain("TRIGGER:-P1D");

    // Showing it again is the same link.
    await page.reload();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Subscribe" })
      .click();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Add to Apple Calendar" }),
    ).toHaveAttribute("href", webcal);

    await page
      .getByRole("main")
      .getByRole("button", { name: "Make a new link" })
      .click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "The old one stopped working",
    );
    const fresh =
      (await page
        .getByRole("main")
        .getByRole("link", { name: "Add to Apple Calendar" })
        .getAttribute("href")) ?? "";
    expect(fresh).not.toBe(webcal);
    expect((await calendarApp.get(httpUrl(webcal))).status()).toBe(404);
    expect((await calendarApp.get(httpUrl(fresh))).status()).toBe(200);
  } finally {
    await calendarApp.dispose();
  }
});
