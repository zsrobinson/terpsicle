import { expect, type Locator, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The bell (V2.md §6.7) on `pnpm dev:mock`: tstudent mentions a classmate
// in a course room; the classmate's bell counts it, Notifications lists it,
// and its row opens the room and reads it, so the count drops. On a phone
// whose bar carries Chat's term, the bell is in the account menu and the
// list is a sheet.

const TERM = "202701";

/**
 * Each project its own course and its own reader, so the two never read or
 * add to each other's count (and neither is chat-notify.spec.ts's).
 */
function setup(isMobile: boolean) {
  return isMobile
    ? {
        course: "GEOL102",
        reader: { id: "tclassmate", name: "Test Classmate" },
        // Chat's bar carries its term: the bell is in the account menu.
        start: "/chat",
      }
    : {
        course: "GEOL100",
        reader: { id: "tadmin", name: "Test Admin" },
        start: "/reviews",
      };
}

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((url) =>
    url.pathname.startsWith(path.split("?")[0] ?? path),
  );
}

const sameOrigin = (page: Page) => ({
  Origin: new URL(page.url()).origin,
  "Sec-Fetch-Site": "same-origin",
});

/** A plan with the course's section 0101, as the sync engine would save it. */
async function syncPlan(page: Page, who: string, course: string) {
  const now = new Date().toISOString();
  const id = `plan_e2e_bell_${who}_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/sync/push", {
    headers: sameOrigin(page),
    data: {
      docs: [
        {
          kind: "plan",
          id,
          baseRev: 0,
          body: {
            id,
            termId: TERM,
            name: "Plan A",
            order: -Date.now(),
            createdAt: now,
            updatedAt: now,
            courses: [
              {
                courseCode: course,
                sectionCode: "0101",
                snapshot: { instructors: [], delivery: "f2f", meetings: [] },
              },
            ],
          },
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

type Item = { id: string; url: string; readAt: string | null };

async function courseItems(page: Page, course: string): Promise<Item[]> {
  const response = await page.request.post("/api/notifications/inbox", {
    headers: sameOrigin(page),
    data: {},
  });
  expect(response.status()).toBe(200);
  const { items } = (await response.json()) as { items: Item[] };
  // Its link is the room's path, `/chat/<COURSE>/<room>`.
  return items.filter((i) => i.url.startsWith(`/chat/${course}/`));
}

/** The unread count the bar shows: the bell's, or the avatar's on a crowded phone. */
async function shownUnread(bar: Locator, isMobile: boolean): Promise<number> {
  const control = isMobile
    ? bar.getByRole("button", { name: /^Account: / })
    : bar.getByTestId("notifications-bell");
  const name = (await control.getAttribute("aria-label")) ?? "";
  return Number(/(\d+) unread/.exec(name)?.[1] ?? 0);
}

test("a mention lights the bell, and its row opens the room and reads it", async ({
  page,
  browser,
  isMobile,
}, info) => {
  // Two people, moderation and a socket: longer than most.
  test.slow();
  const { course, reader, start } = setup(isMobile);
  const room = `${TERM}:${course}`;
  const { viewport, baseURL, hasTouch } = info.project.use;
  const readers = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(baseURL ? { baseURL } : {}),
    isMobile,
    hasTouch: hasTouch ?? false,
  });
  try {
    const theirs = await readers.newPage();
    theirs.on("pageerror", (error) => errors.push(error.message));
    await signIn(theirs, reader.name, start);
    await syncPlan(theirs, reader.id, course);
    // Earlier runs' mentions in this course, read, so this run's is new.
    const earlier = (await courseItems(theirs, course))
      .filter((i) => i.readAt === null)
      .map((i) => i.id);
    if (earlier.length > 0)
      await theirs.request.post("/api/notifications/read", {
        headers: sameOrigin(theirs),
        data: { ids: earlier },
      });

    // tstudent mentions them in the course room.
    await signIn(page, "Test Student", "/chat");
    await syncPlan(page, "tstudent", course);
    await page.goto(`/chat?term=${TERM}&course=${course}&room=${room}`);
    await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible()) await gotIt.click();
    const tag = `${info.project.name}-${Date.now().toString(36)}`;
    const field = page.getByRole("textbox", { name: /^Message/ });
    await field.fill(`@${reader.name} are you at the review? ${tag}`);
    await field.press("Enter");

    // Their inbox has it once the message is checked; the bell asks on load.
    await expect
      .poll(
        async () =>
          (await courseItems(theirs, course)).some((i) => i.readAt === null),
        { timeout: 20_000 },
      )
      .toBe(true);
    await theirs.reload();
    const bar = theirs.locator('[data-slot="app-bar"]');
    await expect
      .poll(() => shownUnread(bar, isMobile), { timeout: 10_000 })
      .toBeGreaterThan(0);
    const before = await shownUnread(bar, isMobile);

    if (isMobile) {
      await expect(theirs.getByTestId("notifications-bell")).toHaveCount(0);
      await expect(bar.getByTestId("account-note")).toBeVisible();
      await bar.getByRole("button", { name: /^Account: / }).click();
      await theirs.getByRole("menuitem", { name: /^Notifications/ }).click();
    } else {
      const bell = bar.getByTestId("notifications-bell");
      await expect(bell).toHaveAccessibleName(
        `Notifications, ${before} unread`,
      );
      await expect(bell.getByTestId("notifications-count")).toHaveText(
        before > 9 ? "9+" : String(before),
      );
      await bell.click();
    }
    const list = theirs.getByRole("dialog", { name: "Notifications" });
    const row = list.getByRole("link", {
      name: new RegExp(`^Test Student in ${course} · Everyone ?, unread$`),
    });
    await expect(row).toBeVisible();
    await expect(list.getByText(tag)).toBeVisible();
    await expect(list.getByRole("heading", { name: "Today" })).toBeVisible();
    await scan(theirs, "notifications");
    await theirs.emulateMedia({ colorScheme: "dark" });
    await scan(theirs, "notifications, dark");
    await theirs.emulateMedia({ colorScheme: "light" });

    // The row's link is the room's path, and opens that room.
    await row.click();
    await theirs.waitForURL(
      (url) => url.pathname === `/chat/${course}/everyone`,
    );
    await expect(theirs.getByRole("log", { name: "Messages" })).toBeVisible();
    await expect(
      theirs.getByRole("region", { name: `${course} · Everyone` }),
    ).toBeVisible();
    await expect(list).toBeHidden();
    // Read, here and on the server: the count drops.
    await expect
      .poll(() => shownUnread(bar, isMobile), { timeout: 10_000 })
      .toBeLessThan(before);
    expect(
      (await courseItems(theirs, course)).filter((i) => i.readAt === null),
    ).toEqual([]);
  } finally {
    await readers.close();
  }
});

test("signed out, there's no bell", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("notifications-bell")).toHaveCount(0);
});

test("with nothing unread, the list says so in a line and links to settings", async ({
  page,
  isMobile,
}) => {
  // Someone new: nothing in their list yet.
  await page.goto("/privacy");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const status = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/todo" }),
    });
    return response.status;
  }, userId);
  expect(status).toBe(200);
  await page.goto("/reviews");
  if (isMobile) {
    // A phone's bell is in the account menu, with no unread note on the
    // avatar.
    const account = page.getByRole("button", { name: /^Account: / });
    await expect(account).toBeVisible({ timeout: 20_000 });
    expect(await account.getAttribute("aria-label")).not.toMatch(/unread/);
    await account.click();
    await page.getByRole("menuitem", { name: /^Notifications/ }).click();
  } else {
    const bell = page.getByTestId("notifications-bell");
    await expect(bell).toHaveAccessibleName("Notifications", {
      timeout: 20_000,
    });
    await expect(bell.getByTestId("notifications-count")).toHaveCount(0);
    await bell.click();
  }
  const list = page.getByRole("dialog", { name: "Notifications" });
  await expect(
    list.getByText("Nothing new. Notifications show up here, pushed or not."),
  ).toBeVisible();
  await expect(list.getByRole("button", { name: "Mark all read" })).toHaveCount(
    0,
  );
  await scan(page, "notifications, empty");
  await list.getByRole("link", { name: "Notification settings" }).click();
  await page.waitForURL((url) => url.pathname === "/settings/notifications");
  await expect(list).toBeHidden();
  if (!isMobile) {
    // Esc closes it and hands focus back to the bell.
    await page.getByTestId("notifications-bell").click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(page.getByTestId("notifications-bell")).toBeFocused();
  }
});
