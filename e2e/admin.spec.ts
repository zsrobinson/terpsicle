import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The owner's admin panel (docs/V2.md §10) in test mode: `pnpm dev:mock`
// signs in with the fixture people, where `tadmin` is the admin and
// `tstudent` isn't. The queue starts empty, so the admin adds test mode's
// made-up held posts ("Add test posts") and works through them. Each run
// adds its own, and every check is scoped to them, so runs and the two
// projects can share the local database.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

// Axe scans in both themes, on a busy machine.
test.describe.configure({ timeout: 90_000 });

async function signInAs(page: Page, name: string, returnTo: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(returnTo)}`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
}

interface Sample {
  id: string;
  targetId: string;
  course: string;
  urgent: boolean;
}

const card = (page: Page, id: string) =>
  page.locator(`[data-queue-item="${id}"]`);

test("a signed-out visit goes through sign-in and back to the panel", async ({
  page,
}) => {
  await page.goto("/admin/decisions?stage=human");
  await expect(page).toHaveURL(
    /\/signin\?return=%2Fadmin%2Fdecisions%3Fstage%3Dhuman$/,
  );
  await page.getByRole("link", { name: "Sign in (test mode)" }).click();
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await expect(page).toHaveURL(/\/admin\/decisions\?stage=human$/);
  await expect(
    page.getByRole("heading", { name: "Decisions", exact: true }),
  ).toBeVisible();
});

test("anyone else signed in gets the plain 404, and the API refuses them", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "Test Student", "/privacy");
  await expect(page).toHaveURL(/\/privacy$/);
  for (const path of ["/admin", "/admin/decisions"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Page not found", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Moderation queue")).toHaveCount(0);
  }
  const api = await page.request.post("/api/admin/moderation/queue", {
    data: {},
    headers: { Origin: baseURL ?? "" },
  });
  expect(api.status()).toBe(403);
});

test("the admin publishes, undoes, removes with a reason, then reads the log", async ({
  page,
  isMobile,
}) => {
  await signInAs(page, "Test Admin", "/admin");
  await expect(page).toHaveURL(/\/admin$/);
  const health = page.getByRole("region", { name: "Health" });
  await expect(health.getByText("AI calls today")).toBeVisible();
  await expect(health.getByText(/ of 2,000$/)).toBeVisible();

  const added = page.waitForResponse((r) =>
    r.url().endsWith("/api/admin/samples"),
  );
  await page.getByRole("button", { name: "Add test posts" }).click();
  const { items } = (await (await added).json()) as { items: Sample[] };
  const pick = (course: string) => {
    const found = items.find((i) => i.course === course);
    if (!found) throw new Error(`no sample in ${course}`);
    return found;
  };
  const urgent = pick("CMSC131");
  const review = pick("CMSC351");
  const spam = pick("ENGL101");
  await expect(card(page, review.id)).toBeVisible();

  // Urgent first; the words a rule matched are marked.
  const order = await page
    .locator("[data-queue-item]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-queue-item")));
  expect(order.indexOf(urgent.id)).toBeLessThan(order.indexOf(review.id));
  await expect(card(page, urgent.id).getByText("Urgent")).toBeVisible();
  await expect(card(page, review.id).locator("mark")).toHaveText(
    "jane.doe@example.com",
  );
  await expect(
    card(page, review.id).getByText("An email address"),
  ).toBeVisible();

  // No page scrolls sideways, even on a phone.
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  // Publish acts at once; Undo in the toast puts it back.
  await card(page, review.id).getByRole("button", { name: "Publish" }).click();
  await expect(card(page, review.id)).toHaveCount(0);
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Back in the queue")).toBeVisible();
  await expect(card(page, review.id)).toBeVisible();

  // Remove, with a reason from the menu.
  await card(page, spam.id).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("menuitem", { name: "Spam or an ad" }).click();
  await expect(card(page, spam.id)).toHaveCount(0);
  await expect(page.getByText("Removed: Spam or an ad")).toBeVisible();

  // What's decided lists it, with its own Undo; Back returns to waiting.
  await page
    .getByRole("navigation", { name: "Queue" })
    .getByRole("button", { name: "Decided" })
    .click();
  await expect(page).toHaveURL(/\/admin\?show=decided$/);
  await expect(
    card(page, spam.id).getByText("Removed: Spam or an ad"),
  ).toBeVisible();
  await expect(
    card(page, spam.id).getByRole("button", { name: "Undo" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/);

  // The decision log, filtered to the owner's own decisions.
  await page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link", { name: "Decisions" })
    .click();
  await expect(page).toHaveURL(/\/admin\/decisions$/);
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: "You" }).click();
  await expect(page).toHaveURL(/\/admin\/decisions\?stage=human$/);
  const log = page.getByRole("list", { name: "Decision log" });
  await expect(log.getByText(spam.targetId)).toBeVisible();
  await expect(
    log.getByRole("listitem").filter({ hasText: spam.targetId }),
  ).toContainText("Spam or an ad");

  // Nothing here names anyone: moderation never stores an author.
  expect(await page.content()).not.toMatch(/Test Student|tstudent/);
  if (isMobile) return;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/admin");
    await expect(card(page, urgent.id)).toBeVisible();
    await scan(page, `admin queue (${scheme})`);
    await page.goto("/admin/decisions");
    await expect(page.getByRole("table")).toBeVisible();
    await scan(page, `admin decisions (${scheme})`);
  }
});
