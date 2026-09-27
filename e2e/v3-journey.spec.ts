import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { addDays, easternToUtc } from "../src/core/ics/dates";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
} from "../src/core/push";
import { newYorkClock } from "../src/core/todo/list";
import { TEST_FEED_TOKENS, testFeedLink } from "../src/core/todo/test-feed";

// v3 end to end (docs/V3.md §11, `v3/e2e`) on `pnpm dev:mock`, in test mode.
// One person, signed out at first:
//   1. imports a transcript into Plan;
//   2. adds a placeholder and resolves it;
//   3. takes the next semester to the scheduler (View schedule);
//   4. signs in;
//   5. and sees the four-year plan on a second device;
//   6. connects the fixture ELMS feed there;
//   7. checks an item off;
//   8. and gets the "Due tomorrow" push when the Todo cron runs at 6:03pm New
//      York.
// The seams are the ones other specs use: test sign-in with a throwaway
// person (`e2e…`, so runs never share an account), the Worker's fixture feed
// (TEST_FEED_TOKENS), a device whose push service is a local server that
// decrypts what the Worker sends (chat-notify.spec.ts), and the dev server's
// scheduled-handler endpoint, whose `time` (epoch milliseconds) sets the
// cron's scheduled time.
// Every "today" and "tomorrow" is New York's, never UTC's.

test.skip(({ isMobile }) => isMobile, "two devices, desktop interactions");

const PASTE = readFileSync(
  "src/core/four-year/transcript/__fixtures__/synthetic-ap-transfer.txt",
  "utf8",
);

/** The Todo cron (wrangler.jsonc), which sends "Due tomorrow" from 6pm. */
const TODO_CRON = "3,23,43 * * * *";

let errors: string[] = [];
const contexts: BrowserContext[] = [];

test.beforeEach(() => {
  errors = [];
});

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
  expect(errors).toEqual([]);
});

/** A fresh browser profile: its own IndexedDB, as another device has. */
async function device(browser: Browser, baseURL?: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}

/** Test sign-in, as /auth/test's button does it, then `path`. */
async function signIn(page: Page, userId: string, path: string) {
  const next = await page.evaluate(
    async ([id, back]) => {
      const response = await fetch("/api/auth/test-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, return: back }),
      });
      const result: { return?: string } = await response.json();
      return result.return ?? "";
    },
    [userId, path] as const,
  );
  expect(next).toContain(path);
  await page.goto(next);
}

const spring = (page: Page) =>
  page.getByRole("region", { name: "Spring 2027", exact: true });

/** A push service on this machine: answers 201 and keeps what it got. */
async function startPushService() {
  const received: { path: string; body: Buffer }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ path: request.url ?? "", body: Buffer.concat(chunks) });
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    received,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("Plan to Schedule to Todo: import, placeholder, View schedule, sync, ELMS, a check, and the 6pm push", async ({
  browser,
  baseURL,
}) => {
  // Two devices, a sync, a feed and a cron: longer than most.
  test.slow();
  const user = `e2e${Math.random().toString(36).slice(2, 12)}`;
  const service = await startPushService();
  try {
    // 1. A laptop, signed out, in Fall 2026 (so Spring 2027, the mock
    // catalog's term, is next): the transcript comes in from the first visit.
    const laptop = await device(browser, baseURL);
    await laptop.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
    await laptop.goto("/plan");
    await laptop.getByRole("button", { name: "Paste your transcript" }).click();
    await laptop.getByLabel("Paste your unofficial transcript").fill(PASTE);
    await laptop
      .getByRole("group", { name: /PSYC100/ })
      .getByText("DSNS", { exact: true })
      .click();
    await laptop
      .getByRole("group", { name: /AASP100/ })
      .getByText("DSHU", { exact: true })
      .click();
    await laptop.getByRole("button", { name: /^Import \d+ courses$/ }).click();
    await expect(
      laptop.getByText(/^Imported \d+ courses from 4 semesters/),
    ).toBeVisible();

    // 2. Spring 2027: a course, and a placeholder that then becomes one.
    const search = laptop.getByRole("searchbox", { name: "Search courses" });
    await spring(laptop)
      .getByRole("button", { name: "Add a course to Spring 2027" })
      .click();
    await search.fill("CMSC351");
    await laptop
      .getByRole("button", { name: "Add CMSC351 to Spring 2027", exact: true })
      .click();
    await search.fill("cmsc4xx");
    await laptop
      .getByRole("button", { name: "Add CMSC4XX to Spring 2027", exact: true })
      .click();
    await expect(spring(laptop).getByText("CMSC4XX")).toBeVisible();
    await spring(laptop)
      .getByRole("button", { name: /^CMSC4XX 3 cr/ })
      .click();
    await laptop
      .getByRole("button", { name: "Use CMSC420 for CMSC4XX" })
      .click();
    await expect(spring(laptop).getByText("CMSC420")).toBeVisible();
    await expect(spring(laptop).getByText("CMSC4XX")).toHaveCount(0);

    // 3. View schedule: Spring's Plan A, with both courses bookmarked.
    await spring(laptop).getByRole("link", { name: "View schedule" }).click();
    await expect(laptop).toHaveURL(/\/schedule\/courses\?/);
    await expect(
      laptop.getByText(
        "Plan A has your 2 courses from your four-year plan. Pick sections for each.",
      ),
    ).toBeVisible();
    await expect(
      laptop.getByRole("list", { name: "Bookmarked" }).getByRole("listitem"),
    ).toHaveText([/^CMSC351/, /^CMSC420/]);

    // 4. Back in Plan, signing in takes the four-year plan to the account.
    await laptop.goto("/plan");
    await expect(spring(laptop).getByText("CMSC420")).toBeVisible();
    await signIn(laptop, user, "/plan");
    const saved = laptop.getByRole("main").locator("[data-sync-status]");
    await expect(saved).toHaveAttribute("data-sync-status", "saved");

    // 5. A second device signs in and has it: transcript, placeholder's pick
    // and all. It runs on the real clock, as the feed and the cron do.
    const phone = await device(browser, baseURL);
    await phone.goto("/plan");
    await signIn(phone, user, "/plan");
    await expect(
      phone.getByRole("main").locator("[data-sync-status]"),
    ).toHaveAttribute("data-sync-status", "saved");
    await expect(spring(phone).getByText("CMSC420")).toBeVisible();
    await expect(spring(phone).getByText("CMSC351")).toBeVisible();
    await expect(
      phone
        .getByRole("region", { name: "Fall 2024", exact: true })
        .getByText("CMSC131"),
    ).toBeVisible();

    // 6. ELMS, from the fixture feed. Connecting turns "Due tomorrow" on;
    // this device takes notifications (its push service is the local one).
    const pair = await generateKeyPair("ECDH", true);
    const uaPublic = await exportPublicKey(pair.publicKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const path = `/push/${user}`;
    const origin = new URL(phone.url()).origin;
    const subscribed = await phone.request.post("/api/push/subscribe", {
      headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
      data: {
        endpoint: `${service.origin}${path}`,
        keys: { p256dh: toBase64url(uaPublic), auth: toBase64url(authSecret) },
        label: "E2E · Chrome",
      },
    });
    expect(await subscribed.json()).toEqual({ status: "ok" });
    await phone.goto("/todo");
    await phone
      .getByLabel("ELMS calendar link")
      .fill(testFeedLink(TEST_FEED_TOKENS.calendar));
    await phone.getByRole("button", { name: "Connect ELMS" }).click();
    await expect(phone.getByText(/^6 open · ELMS feed checked/)).toBeVisible();

    // 7. Project 2, due tomorrow, is done: it folds into "1 done", and it
    // stays done after a reload, since done marks are the account's.
    await phone.getByRole("checkbox", { name: "Done: Project 2" }).click();
    await expect(phone.getByText(/^5 open · ELMS feed checked/)).toBeVisible();
    await expect(phone.getByRole("button", { name: "1 done" })).toBeVisible();
    await phone.reload();
    await expect(phone.getByText(/^5 open · ELMS feed checked/)).toBeVisible();
    await expect(phone.getByRole("button", { name: "1 done" })).toBeVisible();

    // 8. The Todo cron at 6:03pm New York today: one push, for what's still
    // due tomorrow, and it opens tomorrow in Todo.
    const today = newYorkClock(Date.now()).date;
    const tomorrow = addDays(today, 1);
    const sixPm = easternToUtc(today, 18 * 60 + 3);
    const ran = await phone.request.get(
      `/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(TODO_CRON)}&time=${sixPm}`,
    );
    expect(ran.status()).toBe(200);
    const pushes = async () => {
      const out: unknown[] = [];
      for (const d of service.received.filter((r) => r.path === path)) {
        const plain = await decryptPushPayload({
          body: new Uint8Array(d.body),
          uaPrivate: pair.privateKey,
          uaPublic,
          authSecret,
        });
        if (plain) out.push(JSON.parse(new TextDecoder().decode(plain)));
      }
      return out;
    };
    await expect.poll(pushes, { timeout: 15_000 }).toHaveLength(1);
    expect(await pushes()).toEqual([
      {
        v: 1,
        type: "todo-due",
        title: "WebAssign 5 is due tomorrow",
        body: "MATH240 · 11:59pm",
        url: `/todo?day=${tomorrow}`,
        tag: "todo-due",
      },
    ]);
  } finally {
    await service.close();
  }
});
