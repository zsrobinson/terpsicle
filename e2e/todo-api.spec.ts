import { expect, type Page, test } from "@playwright/test";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";

// Terpsicle Todo's API in test mode (docs/V3.md §3.3, §3.8): `pnpm dev:mock`
// turns Todo on with the fixed test key, and feed links with the fixture
// tokens are answered by the Worker, never fetched. There's no Todo UI yet
// (`v3/todo-ui`), so this drives the routes from a signed-in page.

test.skip(({ isMobile }) => isMobile, "API only: once is enough");

async function signIn(page: Page) {
  await page.goto("/auth/test?return=/schedule");
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await expect(
    page
      .getByRole("banner")
      .getByRole("button", { name: "Account: Test Student" }),
  ).toBeVisible();
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
      return { status: response.status, body: await response.json() };
    },
    [name, body] as const,
  );
}

test("connect the fixture feed, check an item off, and disconnect", async ({
  page,
}) => {
  await signIn(page);
  expect((await post(page, "me")).body.flags.todo).toBe(true);

  const connected = await post(page, "todo/connect", {
    url: testFeedLink(TEST_FEED_TOKENS.calendar),
  });
  expect(connected.status).toBe(200);
  expect(connected.body.status).toBe("connected");
  expect(connected.body.feed).toMatchObject({ status: "active", itemCount: 6 });
  expect(JSON.stringify(connected.body)).not.toContain(
    TEST_FEED_TOKENS.calendar,
  );
  const project = connected.body.items.find(
    (i: { title: string }) => i.title === "Project 2",
  );
  expect(project).toMatchObject({ courseCode: "CMSC216", exam: false });

  await post(page, "todo/done", { uid: project.uid, done: true });
  const day = project.dueDate as string;
  const listed = await post(page, "todo/list", { from: day, to: day });
  expect(listed.body.done).toEqual([project.uid]);
  expect(listed.body.items.map((i: { title: string }) => i.title)).toEqual([
    "Project 2",
    "WebAssign 5",
  ]);

  expect(
    (
      await post(page, "todo/connect", {
        url: testFeedLink(TEST_FEED_TOKENS.gone),
      })
    ).body,
  ).toEqual({ status: "not-a-calendar" });

  expect((await post(page, "todo/disconnect")).body).toEqual({
    status: "disconnected",
  });
  expect((await post(page, "todo/list", { from: day, to: day })).body).toEqual({
    feed: null,
    items: [],
    done: [],
  });
});
