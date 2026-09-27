import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";

// Terpsicle Chat end to end (V2.md §8): two test-mode people, tstudent and
// tclassmate, in the same section, against `pnpm dev:mock`'s Worker (the
// real socket, CourseChat object and moderation service, with offline
// stand-ins for the models). Plans reach the server through sync/push, as
// they will from the sync engine.

const TERM = "202701";

/** Each project gets its own course, so parallel runs never share a room. */
function courseFor(info: TestInfo) {
  return info.project.name === "mobile"
    ? { course: "CMSC330", section: "0101" }
    : { course: "CMSC351", section: "0101" };
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

/**
 * Saves a plan with both e2e courses through sync/push (the sync engine's
 * job, not built yet), so either project's course is in whichever plan is
 * someone's chat plan. The newest plan goes first in tab order.
 */
async function syncPlan(page: Page, who: string) {
  const now = new Date().toISOString();
  // Chat reads rooms from the catalog; the snapshot only has to be valid.
  const snapshot = { instructors: [], delivery: "f2f", meetings: [] };
  const courses = ["CMSC351", "CMSC330"].map((courseCode) => ({
    courseCode,
    sectionCode: "0101",
    snapshot,
  }));
  const id = `plan_e2e_${who}_${Date.now().toString(36)}`;
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/sync/push", {
    headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
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
            courses,
          },
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
  expect((await response.json()).results[0].status).toBe("ok");
}

async function newPerson(
  browser: Browser,
  info: TestInfo,
): Promise<{ context: BrowserContext; page: Page }> {
  const { viewport, isMobile, hasTouch, baseURL } = info.project.use;
  const context = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
    ...(baseURL ? { baseURL } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}

const roomUrl = (course: string, section: string) =>
  `/chat?term=${TERM}&course=${course}&room=${TERM}:${course}:${section}`;

/** A message in the log, by its text. */
const message = (page: Page, text: string): Locator =>
  page.getByRole("log").getByRole("article").filter({ hasText: text });

/**
 * Presses one of a message's actions, which show on hover with a mouse and
 * on a tap on a phone. New messages can move the list under the pointer, so
 * it tries again until the press lands.
 */
async function messageAction(item: Locator, name: string, isMobile: boolean) {
  const button = item.getByRole("button", { name, exact: true });
  await expect(async () => {
    if (!(await button.isVisible())) {
      if (isMobile) await item.locator("[data-message-body]").tap();
      else await item.hover();
    }
    await button.click({ timeout: 1_000 });
  }).toPass();
}

async function send(page: Page, text: string) {
  const field = page.getByRole("textbox", { name: /^Message|Reply/ });
  await field.fill(text);
  await field.press("Enter");
}

/** The room rules show the first time you open a course's chat. */
async function dismissRules(page: Page) {
  await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  await expect(
    page
      .getByRole("log")
      .getByRole("paragraph")
      .or(page.getByRole("log").getByRole("article"))
      .first(),
  ).toBeVisible();
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible()) await gotIt.click();
}

test("signed out, Chat says what it keeps and what classmates see", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", {
      name: "A chat room for every class",
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Classmates see your Google name and picture"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in (test mode)" }),
  ).toBeVisible();
});

test("with no classes yet, find any course and open its room", async ({
  page,
}) => {
  // Someone new: no synced plans, so no rooms of their own.
  await page.goto("/privacy");
  const userId = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const next = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/chat" }),
    });
    const result: { return?: string } = await response.json();
    return result.return ?? "";
  }, userId);
  await page.goto(next);

  await expect(
    page.getByRole("heading", { name: "No classes here yet" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View schedule" })).toBeVisible();
  // The finder: already in the list on a desktop, and brought in on a phone.
  await page.getByRole("button", { name: "Find a course" }).click();
  const box = page.getByRole("searchbox", { name: "Find a course's chat" });
  await expect(box).toBeFocused();
  await box.fill("cmsc131");
  await expect(
    page.getByRole("list", { name: "Courses" }).getByRole("button").first(),
  ).toContainText("CMSC131");
  await box.press("Enter");

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("room") === `${TERM}:CMSC131`,
  );
  await expect(
    page.getByRole("textbox", { name: /^Message CMSC131/ }),
  ).toBeVisible();
});

test("two classmates talk in their section's room", async ({
  page,
  browser,
  isMobile,
}, info) => {
  // Two people, a live socket and moderation: longer than most specs.
  test.slow();
  const { course, section } = courseFor(info);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, "Test Student", "/chat");
  await syncPlan(page, "tstudent");
  const classmate = await newPerson(browser, info);
  await signIn(classmate.page, "Test Classmate", "/chat");
  await syncPlan(classmate.page, "tclassmate");

  // The list: your classes, grouped by course, with your rooms.
  await page.goto("/chat");
  const rooms = page.getByRole("navigation", { name: "Rooms" });
  await expect(
    rooms.getByRole("listitem").filter({ hasText: course }),
  ).toBeVisible();
  await rooms
    .getByRole("listitem")
    .filter({ hasText: course })
    .getByRole("button", { name: new RegExp(`^${section} ·`) })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `room=${TERM}%3A${course}%3A${section}|room=${TERM}:${course}:${section}`,
    ),
  );
  await dismissRules(page);

  // tstudent writes; it shows at once, then for everyone once it's checked.
  const first = `Anyone want to study for the midterm? ${tag}`;
  await send(page, first);
  await expect(message(page, first)).toBeVisible();
  // Nothing says it's being checked: it just looks sent.
  await expect(message(page, first).getByTestId("held-note")).toHaveCount(0);
  await expect(message(page, first).getByText(/checking/i)).toHaveCount(0);

  await classmate.page.goto(roomUrl(course, section));
  await dismissRules(classmate.page);
  await expect(message(classmate.page, first)).toBeVisible();

  // Typing shows on the other side, then a reaction arrives live.
  await classmate.page
    .getByRole("textbox", { name: /^Message/ })
    .pressSequentially("me", { delay: 50 });
  await expect(page.getByText("Test is typing…")).toBeVisible();
  await classmate.page.getByRole("textbox", { name: /^Message/ }).fill("");

  const theirs = message(classmate.page, first);
  await messageAction(theirs, "React", isMobile);
  await classmate.page
    .getByRole("dialog")
    .getByRole("button", { name: "Thumbs up", exact: true })
    .click();
  await expect(
    message(page, first).getByRole("button", { name: "Thumbs up: 1 person" }),
  ).toBeVisible();

  // A one-level thread: the reply count shows under the first message.
  await messageAction(theirs, "Reply in a thread", isMobile);
  await expect(
    classmate.page.getByRole("heading", { name: "Thread" }),
  ).toBeVisible();
  await send(classmate.page, `Me! Library at 6? ${tag}`);
  await expect(
    message(page, first).getByRole("button", { name: /^1 reply · last/ }),
  ).toBeVisible();

  // Edit with undo, then delete with undo.
  const mine = message(page, first);
  await messageAction(mine, "More", isMobile);
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edited = `Anyone want to study for the final? ${tag}`;
  await page.getByRole("textbox", { name: "Edit your message" }).fill(edited);
  await page.getByRole("textbox", { name: "Edit your message" }).press("Enter");
  await expect(message(page, edited).getByText("(edited)")).toBeVisible();
  await expect(message(classmate.page, edited)).toBeVisible();

  const again = message(page, edited);
  await messageAction(again, "More", isMobile);
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(message(page, edited)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(message(page, edited)).toBeVisible();

  // Room info: how many people, and muting (no dialogs anywhere).
  await page.getByRole("button", { name: "Room info" }).click();
  const info2 = isMobile
    ? page.getByRole("dialog")
    : page.getByRole("complementary", { name: "Room info" });
  await expect(
    info2.getByText(/Terpsicle can't see registrations/),
  ).toBeVisible();
  // Muting flips, and says so (local runs may find it muted already).
  const mute = info2.getByRole("button", { name: /^(Mute this room|Muted)$/ });
  const was = await mute.getAttribute("aria-pressed");
  await mute.click();
  await expect(mute).toHaveAttribute(
    "aria-pressed",
    was === "true" ? "false" : "true",
  );

  await classmate.context.close();
});

test("answers get a nudge, held messages stay with their author, and abuse reports reach a person", async ({
  page,
  browser,
  isMobile,
}, info) => {
  // Two people, a live socket and moderation: longer than most specs.
  test.slow();
  const { course, section } = courseFor(info);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  await signIn(page, "Test Student", roomUrl(course, section));
  await syncPlan(page, "tstudent");
  const classmate = await newPerson(browser, info);
  await signIn(classmate.page, "Test Classmate", roomUrl(course, section));
  await syncPlan(classmate.page, "tclassmate");
  await page.reload();
  await classmate.page.reload();
  await dismissRules(page);
  await dismissRules(classmate.page);

  // Answers to graded work get a gentle nudge in the composer, once, and
  // still send: classmates see them, and nothing marks them as checked.
  const answers = `here are the answers to hw 3 ${tag}`;
  const field = page.getByRole("textbox", { name: /^Message/ });
  await field.fill(answers);
  const nudge = page.getByText(/a hint helps more/);
  await expect(nudge).toBeVisible();
  await field.press("Enter");
  await expect(nudge).toHaveCount(0);
  await expect(message(classmate.page, answers)).toBeVisible();
  await expect(message(page, answers).getByTestId("held-note")).toHaveCount(0);
  await field.fill(`here are the answers to hw 4 ${tag}`);
  await expect(nudge).toHaveCount(0);
  await field.fill("");

  // A blocked word waits for a person: one calm line, for its author only.
  const held = `found a chink in his argument ${tag}`;
  await send(page, held);
  await expect(
    message(page, held).getByText(
      "Only you can see this for now, until a person looks at it.",
    ),
  ).toBeVisible();

  // A classmate never sees it; they see the next one, and report it.
  const later = `meet me behind the library ${tag}`;
  await send(page, later);
  await expect(message(classmate.page, later)).toBeVisible();
  await expect(message(classmate.page, held)).toHaveCount(0);

  const reported = message(classmate.page, later);
  await messageAction(reported, "More", isMobile);
  await classmate.page.getByRole("menuitem", { name: "Report" }).click();
  const form = classmate.page.getByRole("form", {
    name: "Report this message",
  });
  // Abuse only.
  await expect(form.getByRole("radio")).toHaveCount(6);
  await expect(
    form.getByRole("radio", { name: /graded work|off-topic/i }),
  ).toHaveCount(0);
  // "Something else" needs a note first.
  await form.getByRole("radio", { name: "Something else" }).check();
  await expect(
    form.getByRole("button", { name: "Send report" }),
  ).toBeDisabled();
  await form.getByRole("radio", { name: "A threat" }).check();
  await form.getByRole("button", { name: "Send report" }).click();
  await expect(
    classmate.page.getByText("Thanks. A person will look at it."),
  ).toBeVisible();

  // A threat report takes it down until a person decides; its author is told, quietly.
  await expect(
    message(page, later).getByText(
      /classmates reported it, so a person will look at it/,
    ),
  ).toBeVisible();

  await classmate.context.close();
});

test("course details in the scheduler lead to the course's chat", async ({
  page,
}, info) => {
  // The scheduler, then Chat: two cold page loads in dev.
  test.slow();
  const { course } = courseFor(info);
  await signIn(page, "Test Student", "/schedule");
  await page.goto(`/schedule?term=${TERM}&course=${course}`);
  const join = page.getByRole("link", {
    name: new RegExp(`^Join ${course} chat`),
  });
  // Loaded on demand, the first time course details opens.
  await expect(join).toBeVisible({ timeout: 15_000 });
  await join.click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`room=${TERM}(%3A|:)${course}($|&)`));
});
