import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { alertsHarnessPort } from "../scripts/e2e-checkout";

// Seat alerts end to end (SPEC §3.12, BUILD §5): the bell on a full section →
// the confirmation email → the confirm page → "Watching" in the app and in
// Export → a seats run reopens the section → the alert email → its stop
// link, which asks first → Export no longer lists it.
//
// The app is `pnpm dev:mock`; its /api/* calls go to the e2e harness
// (e2e/alerts-harness): the real router and alert code over local D1 and R2,
// with the flag on and an EMAIL binding that keeps what it's sent.

const HARNESS = `http://localhost:${alertsHarnessPort(path.resolve(import.meta.dirname, ".."))}`;

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

async function routeApi(page: Page, ip: string) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${HARNESS}${url.pathname}`,
      headers: { ...route.request().headers(), "cf-connecting-ip": ip },
    });
    await route.fulfill({ response });
  });
}

/** The demo plans on `dev:mock`, once the calendar has drawn them. */
async function openApp(page: Page) {
  await page.goto("/?demo=1");
  // The test loads the app three times, and a busy machine can be slow.
  await expect(
    page
      .getByRole("region", { name: "Week calendar" })
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function openCourse(page: Page, query: string, code: string) {
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search courses" }).fill(query);
  await page.locator(`[data-course-result="${code}"]`).click();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText(code);
}

async function openExport(page: Page) {
  await page
    .getByRole("navigation", { name: "Sidebar tabs" })
    .getByRole("button", { name: /^Export/ })
    .click();
}

const tokenIn = (message: Sent | undefined, path: string) => {
  const token = message?.text.match(
    new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`),
  )?.[1];
  if (!token) throw new Error(`No ${path} link in ${message?.subject}`);
  return token;
};

test("bell → confirm → Watching → alert → stop, with Export in step", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = `e2e-${run}@terpmail.umd.edu`;
  await routeApi(page, `192.0.2.${Number(run.slice(-3)) % 250}`);
  await request.post(`${HARNESS}/__test/seed`);
  const inbox = async () =>
    (await (
      await request.get(
        `${HARNESS}/__test/emails?to=${encodeURIComponent(email)}`,
      )
    ).json()) as Sent[];

  // "Watch for a seat" on a full section: one email field, one confirmation link.
  await openApp(page);
  await openCourse(page, "cmsc 351", "CMSC351");
  const row = page.locator('[data-section="0101"]');
  await expect(row).toContainText("Full");
  await row.getByRole("button", { name: /^Watch for a seat/ }).click();
  await page.getByRole("textbox", { name: "Your email" }).fill(email);
  await page.getByRole("button", { name: "Email me" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email. Click the link there to start watching.",
  );
  await expect.poll(async () => (await inbox()).length).toBe(1);
  const [confirmation] = await inbox();
  expect(confirmation?.subject).toBe(
    "Confirm your seat alert for CMSC351 0101",
  );

  // Export lists the request while it waits.
  await page.keyboard.press("Escape");
  await openExport(page);
  const listed = page.locator('[data-testid="seat-alert-CMSC351-0101"]');
  await expect(listed).toContainText("Check your email");

  // The confirmation link: "Watching".
  await page.goto(
    `/alerts/confirm?token=${tokenIn(confirmation, "/alerts/confirm")}`,
  );
  await expect(page.getByRole("heading", { name: "Watching" })).toBeVisible();
  await expect(page.getByText("CMSC351 0101")).toBeVisible();

  // Back in the app: Export and the bell both say Watching.
  await openApp(page);
  await openExport(page);
  await expect(listed).toContainText("Watching");
  await expect(listed).toContainText(`Emails go to ${email}`);
  await openCourse(page, "cmsc 351", "CMSC351");
  await expect(
    row.getByRole("button", { name: /^Watching CMSC351 0101/ }),
  ).toBeVisible();

  // A seats run where the section reopens: one alert email.
  const reopened = await request.post(`${HARNESS}/__test/reopen`, {
    data: { sectionKey: "CMSC351-0101", open: 3 },
  });
  expect(await reopened.json()).toMatchObject({ sent: 1 });
  const alert = (await inbox()).find(
    (m) => m.subject === "3 seats opened in CMSC351 0101",
  );
  expect(alert?.text).toContain("Seats: 3 of 120 open");
  expect(alert?.headers?.["List-Unsubscribe"]).toMatch(
    /\/alerts\/unsubscribe\?token=/,
  );
  expect(alert?.headers).not.toHaveProperty("List-Unsubscribe-Post");

  // Its stop link asks first, and only the button stops it.
  await page.goto(
    `/alerts/unsubscribe?token=${tokenIn(alert, "/alerts/unsubscribe")}`,
  );
  await expect(
    page.getByRole("heading", { name: "Stop seat alerts?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop alerts" }).click();
  await expect(
    page.getByRole("heading", { name: "Seat alerts stopped" }),
  ).toBeVisible();

  // The app learns it on its next load: Export no longer lists the watch.
  await openApp(page);
  await openExport(page);
  await expect(listed).toHaveCount(0);

  // And a second reopen sends nothing.
  const again = await request.post(`${HARNESS}/__test/reopen`, {
    data: { sectionKey: "CMSC351-0101", open: 5 },
  });
  expect(await again.json()).toMatchObject({ sent: 0 });
});
