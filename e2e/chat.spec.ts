import {
  type Browser,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from "@playwright/test";
import { signInNewUser } from "./test-user";

// Terpsicle Chat end to end (V2.md §8): two fresh test-mode people
// in the same section, against `pnpm dev:mock`'s Worker (the
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

/** A room's path (~/core/chat/room-paths): `/chat/CMSC351/0101`. */
const roomUrl = (course: string, section: string) =>
  `/chat/${course}/${section}`;

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
    page.getByText(/Classmates see your name from Google/),
  ).toBeVisible();
  await expect(page.getByText(/There are no profile pictures/)).toBeVisible();
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
    (url) => url.pathname === "/chat/CMSC131/everyone",
  );
  await expect(
    page.getByRole("textbox", { name: /^Message CMSC131/ }),
  ).toBeVisible();
});

test(
  "two classmates talk in their section's room",
  {
    tag: "@critical",
  },
  async ({ page, browser, isMobile }, info) => {
    // Two people, a live socket and moderation: longer than most specs.
    test.slow();
    const { course, section } = courseFor(info);
    const tag = `${info.project.name}-${Date.now().toString(36)}`;
    await signInNewUser(page, "/chat");
    await syncPlan(page, "tstudent");
    const classmate = await newPerson(browser, info);
    await signInNewUser(classmate.page, "/chat");
    await syncPlan(classmate.page, "tclassmate");

    // The list: your classes, grouped by course, with your rooms. A fresh
    // account's first list is several round trips in a row (the session, the
    // synced plans, unread counts, the term's manifest, then the course's
    // department file), which
    // on a busy CI dev server can take longer than one expect's 5 seconds.
    await page.goto("/chat");
    const rooms = page.getByRole("navigation", { name: "Rooms" });
    await expect(
      rooms.getByRole("listitem").filter({ hasText: course }),
    ).toBeVisible({ timeout: 15_000 });
    await rooms
      .getByRole("listitem")
      .filter({ hasText: course })
      .getByRole("button", { name: `Section ${section}` })
      .click();
    // A room is a path now, a prettier link.
    await expect(page).toHaveURL(new RegExp(`/chat/${course}/${section}$`));
    await dismissRules(page);
    // Who's here shows as joins in the room, grouped on one quiet line.
    await expect(
      page.getByRole("log").locator("[data-join-line]").first(),
    ).toContainText("joined");

    // tstudent writes; it shows at once, then for everyone once it's checked.
    const first = `Anyone want to study for the midterm? ${tag}`;
    await send(page, first);
    await expect(message(page, first)).toBeVisible();
    // Nothing says it's being checked: it just looks sent.
    await expect(message(page, first).getByTestId("held-note")).toHaveCount(0);
    await expect(message(page, first).getByText(/checking/i)).toHaveCount(0);
    // The list's second line is the room's newest message, not a summary.
    if (!isMobile)
      await expect(
        page
          .getByRole("navigation", { name: "Rooms" })
          .locator(`[data-room-row="${TERM}:${course}:${section}"]`),
      ).toContainText(`You: ${first}`);

    await classmate.page.goto(roomUrl(course, section));
    await dismissRules(classmate.page);
    await expect(message(classmate.page, first)).toBeVisible();

    // Typing shows on the other side, then a reaction arrives live.
    await classmate.page
      .getByRole("textbox", { name: /^Message/ })
      .pressSequentially("me", { delay: 50 });
    await expect(page.getByText("E2E is typing…")).toBeVisible();
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
    // A thread's one way out is Back to its room (no second ×).
    await expect(
      classmate.page.getByRole("button", { name: "Close the thread" }),
    ).toHaveCount(0);
    await classmate.page
      .getByRole("link", {
        name: `${course} · Section ${section}`,
        exact: true,
      })
      .click();
    await expect(
      classmate.page.getByRole("heading", { name: "Thread" }),
    ).toHaveCount(0);

    // Edit with undo, then delete with undo.
    const mine = message(page, first);
    await messageAction(mine, "More", isMobile);
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const edited = `Anyone want to study for the final? ${tag}`;
    await page.getByRole("textbox", { name: "Edit your message" }).fill(edited);
    await page
      .getByRole("textbox", { name: "Edit your message" })
      .press("Enter");
    await expect(message(page, edited).getByText("(edited)")).toBeVisible();
    await expect(message(classmate.page, edited)).toBeVisible();

    const again = message(page, edited);
    await messageAction(again, "More", isMobile);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(message(page, edited)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(message(page, edited)).toBeVisible();

    // Deleted for real, it leaves a tombstone for everyone: the record stays,
    // the words don't.
    const id = await message(page, edited).getAttribute("data-message-id");
    await messageAction(message(page, edited), "More", isMobile);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    // On a phone the menu is a sheet, so Delete sat at the bottom, where the
    // toast now slides up under the test's mouse, which a phone doesn't
    // have: hovered, the toast would wait forever.
    if (isMobile) await page.mouse.move(0, 0);
    // The same message, by its id: sent once Undo runs out.
    const tombstone = (p: Page) =>
      p.getByRole("log").locator(`[data-message-id="${id}"]`);
    await expect(tombstone(classmate.page)).toContainText(
      "Message deleted by author",
      { timeout: 20_000 },
    );
    await expect(message(classmate.page, edited)).toHaveCount(0);
    await expect(tombstone(page)).toContainText("Message deleted by author");

    // The room's one button, Options: muting flips it (local runs may find
    // it muted already), with no dialogs anywhere.
    const options = page.getByRole("button", { name: /^(Options|Muted)$/ });
    const wasMuted = (await options.textContent())?.includes("Muted") ?? false;
    await options.click();
    await page
      .getByRole("menuitem", {
        name: wasMuted ? "Unmute this room" : "Mute this room",
      })
      .click();
    await expect(
      page.getByRole("button", { name: wasMuted ? "Options" : "Muted" }),
    ).toBeVisible();
    // And the list marks a muted room with its bell.
    if (!isMobile)
      await expect(
        page
          .getByRole("navigation", { name: "Rooms" })
          .locator(`[data-room-row="${TERM}:${course}:${section}"]`)
          .getByLabel("Muted"),
      ).toHaveCount(wasMuted ? 0 : 1);

    await classmate.context.close();
  },
);

test("answers get a nudge, held messages stay with their author, and abuse reports reach a person", async ({
  page,
  browser,
  isMobile,
}, info) => {
  // Two people, a live socket and moderation: longer than most specs.
  test.slow();
  const { course, section } = courseFor(info);
  const tag = `${info.project.name}-${Date.now().toString(36)}`;
  await signInNewUser(page, roomUrl(course, section));
  await syncPlan(page, "tstudent");
  const classmate = await newPerson(browser, info);
  await signInNewUser(classmate.page, roomUrl(course, section));
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
  const nudge = page.getByText(/reads like answers to graded work/);
  await expect(nudge).toBeVisible();
  await field.press("Enter");
  await expect(nudge).toHaveCount(0);
  await expect(message(classmate.page, answers)).toBeVisible();
  await expect(message(page, answers).getByTestId("held-note")).toHaveCount(0);
  await field.fill(`here are the answers to hw 4 ${tag}`);
  await expect(nudge).toHaveCount(0);
  await field.fill("");

  // A blocked word waits for a person: tinted yellow with one plain line,
  // for its author only.
  const held = `found a chink in his argument ${tag}`;
  await send(page, held);
  await expect(
    message(page, held).getByText(
      "Held for review. Only you can see it until a person checks it.",
    ),
  ).toBeVisible();
  await expect(message(page, held)).toHaveAttribute("data-held", "");

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
    classmate.page.getByText("Reported. A person will read it."),
  ).toBeVisible();

  // A threat report takes it down until a person decides; its author is told, quietly.
  await expect(
    message(page, later).getByText(
      "Held for review after a report. Only you can see it until a person checks it.",
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
  await signInNewUser(page, "/schedule");
  await page.goto(`/schedule?term=${TERM}&course=${course}`);
  const join = page.getByRole("link", {
    name: new RegExp(`^Join ${course} chat`),
  });
  // Loaded on demand, the first time course details opens.
  await expect(join).toBeVisible({ timeout: 15_000 });
  await join.click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/chat/${course}/everyone$`));
});

test("the list updates live for rooms other than the open one, in this course and others", async ({
  page,
  browser,
  isMobile,
}, info) => {
  test.slow();
  const { course, section } = courseFor(info);
  const other = course === "CMSC351" ? "CMSC330" : "CMSC351";
  const tag = `${info.project.name}-live-${Date.now().toString(36)}`;
  await signInNewUser(page, "/chat");
  await syncPlan(page, "tstudent");
  const classmate = await newPerson(browser, info);
  await signInNewUser(classmate.page, "/chat");
  await syncPlan(classmate.page, "tclassmate");

  // Room A open: the student's section room.
  await page.goto(roomUrl(course, section));
  await dismissRules(page);
  // By element, not role: on a phone the list is under the room, hidden.
  const row = (room: string) =>
    page.locator(`nav[aria-label="Rooms"] [data-room-row="${room}"]`);
  // The list has its rows before anything is said.
  await expect(row(`${TERM}:${other}`)).toBeAttached({ timeout: 15_000 });

  // Room B, in the same course, and a room in another course: the classmate
  // writes in both.
  const inCourse = `same course ${tag}`;
  const elsewhere = `other course ${tag}`;
  await classmate.page.goto(`/chat/${course}/everyone`);
  await dismissRules(classmate.page);
  await send(classmate.page, inCourse);
  await classmate.page.goto(`/chat/${other}/everyone`);
  await dismissRules(classmate.page);
  await send(classmate.page, elsewhere);

  // Back to the list on a phone, which stayed live under the room.
  if (isMobile) await page.getByRole("link", { name: "Your classes" }).tap();
  // Well inside the list's minute-long poll: the sockets said so.
  for (const [room, text] of [
    [`${TERM}:${course}`, inCourse],
    [`${TERM}:${other}`, elsewhere],
  ] as const) {
    await expect(row(room)).toContainText(`E2E: ${text}`, {
      timeout: 15_000,
    });
    await expect(row(room).locator("[data-unread-mark]")).toBeVisible();
  }
  await classmate.context.close();
});

test("an older link, with the room in its search params, goes to the room's path", async ({
  page,
}, info) => {
  const { course, section } = courseFor(info);
  await signInNewUser(page, "/chat");
  await page.goto(
    `/chat?term=${TERM}&course=${course}&room=${TERM}:${course}:${section}`,
  );
  await expect(page).toHaveURL(new RegExp(`/chat/${course}/${section}$`));
  await expect(
    page.getByRole("region", { name: `${course} · Section ${section}` }),
  ).toBeVisible({ timeout: 15_000 });
  // A course on its own is its room for everyone.
  await page.goto(`/chat/${course}`);
  await expect(page).toHaveURL(new RegExp(`/chat/${course}/everyone$`));
});

test("a course from a term that isn't Chat's has no Join, and the server won't join one", async ({
  page,
}, info) => {
  test.slow();
  const { course } = courseFor(info);
  // On 2026-07-01 Summer 2026 is in session, so it's Chat's term and the
  // mock's Spring 2027 is still to come.
  await page.clock.setFixedTime(new Date("2026-07-01T16:00:00Z"));
  await signInNewUser(page, "/schedule");
  await page.goto(`/schedule?term=${TERM}&course=${course}`);
  await expect(
    page.getByRole("button", { name: "More about this course" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("link", { name: new RegExp(`^Join ${course} chat`) }),
  ).toHaveCount(0);

  // The server keeps its own time: Spring 2027 is its Chat's term, and
  // Summer 2026, long over, isn't one to join.
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/chat/follow", {
    headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
    data: { termId: "202605", courseCode: course },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "other-term" });
});

test("the list resizes like the other workbenches' sidebars, and keeps its width", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones have no sidebar to resize");
  await signInNewUser(page, "/chat");
  const list = page.getByRole("navigation", { name: "Rooms" });
  const handle = page.getByRole("separator", { name: "Sidebar width" });
  const widthOf = async () =>
    Math.round((await list.boundingBox())?.width ?? 0);
  await expect(handle).toBeVisible();
  // The workbenches' shared width: 360 unless someone chose another.
  expect(await widthOf()).toBe(360);
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(widthOf).toBe(392);
  await page.reload();
  await expect(handle).toHaveAttribute("aria-valuenow", "392");
  expect(await widthOf()).toBe(392);
  await handle.dblclick();
  await expect.poll(widthOf).toBe(360);
});
