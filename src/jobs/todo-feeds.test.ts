// The Todo feeds cron (docs/V3.md §3.5) on real D1, with ELMS faked from the
// parser's synthetic feeds: cadence, conditional GETs, backoff, `broken`,
// pausing, batching, key rotation, and the daily job's pruning.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { TodoConnectResultSchema } from "~/core/schema";
import { dueFeeds, todoHealth } from "~/server/todo/store";
import {
  clearTodo,
  type Device,
  ELMS_FEED,
  FakeElms,
  FEED_URL,
  signIn,
  TEST_KEYS,
  todoEnv,
} from "~/server/todo/testing";
import { runDailyJob } from "./daily";
import { runTodoFeedsJob } from "./todo-feeds";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
let clock = Date.parse("2026-09-26T16:00:00.000Z");
const now = () => new Date(clock);
let elms: FakeElms;
let testEnv = todoEnv();

beforeEach(async () => {
  clock = Date.parse("2026-09-26T16:00:00.000Z");
  elms = new FakeElms();
  testEnv = todoEnv();
  await clearTodo();
});

const device = (userId = "tstudent") =>
  signIn(userId, { now, env: () => testEnv, elms });

async function connected(userId = "tstudent"): Promise<Device> {
  const phone = await device(userId);
  const answer = TodoConnectResultSchema.parse(
    await phone.call("/api/todo/connect", { url: FEED_URL }),
  );
  expect(answer.status).toBe("connected");
  return phone;
}

const run = () =>
  runTodoFeedsJob({ env: testEnv, now: now(), fetch: elms.fetch });

interface Row {
  user_id: string;
  status: string;
  next_fetch_at: string;
  last_fetch_at: string | null;
  last_success_at: string | null;
  failure_count: number;
  last_error: string | null;
  gone_strikes: number;
  url_enc: string;
  item_count: number;
}
const feed = async (userId = "tstudent") => {
  const row = await env.DB.prepare(
    "SELECT * FROM todo_feeds WHERE user_id = ?1",
  )
    .bind(userId)
    .first<Row>();
  if (!row) throw new Error("no feed row");
  return row;
};
const at = (ms: number) => new Date(ms).toISOString();
const titles = async () =>
  (
    await env.DB.prepare("SELECT title FROM todo_items ORDER BY title").all<{
      title: string;
    }>()
  ).results.map((r) => r.title);

describe("the todo-feeds cron", () => {
  it("does nothing while Todo is off", async () => {
    await connected();
    clock += 20 * MINUTE;
    testEnv = todoEnv({ TODO_ENABLED: "off" });
    await run();
    expect(elms.requests).toHaveLength(1);
  });

  it("fetches due feeds every 20 minutes, conditionally", async () => {
    await connected();
    clock += 10 * MINUTE;
    await run();
    expect(elms.requests).toHaveLength(1);
    clock += 10 * MINUTE;
    await run();
    expect(elms.requests).toHaveLength(2);
    expect(elms.requests[1]?.headers.get("If-None-Match")).toBe('"v1"');
    expect(await feed()).toMatchObject({
      status: "active",
      last_success_at: now().toISOString(),
      next_fetch_at: at(clock + 20 * MINUTE),
    });
  });

  it("writes only what changed, and drops what left the feed", async () => {
    const phone = await connected();
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410003",
      done: true,
    });
    const before = await env.DB.prepare(
      "SELECT uid, updated_at FROM todo_items WHERE uid = 'event-assignment-4410002'",
    ).first();
    elms.serve(
      ELMS_FEED.replaceAll(
        "SUMMARY:Project 2 [",
        "SUMMARY:Project 2 (extended) [",
      ).replace("UID:event-assignment-4410003", "UID:event-assignment-4410093"),
    );
    clock += 20 * MINUTE;
    await run();
    expect(await titles()).toContain("Project 2 (extended)");
    // An untouched item keeps its row as it was.
    expect(
      await env.DB.prepare(
        "SELECT uid, updated_at FROM todo_items WHERE uid = 'event-assignment-4410002'",
      ).first(),
    ).toEqual(before);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM todo_items WHERE uid = 'event-assignment-4410003'",
      ).first("n"),
    ).toBe(0);
    // Its done mark stays until pruning.
    expect(await env.DB.prepare("SELECT uid FROM todo_done").first("uid")).toBe(
      "event-assignment-4410003",
    );
  });

  it("writes one row for a feed whose body didn't change", async () => {
    await connected();
    elms.etag = null;
    clock += 20 * MINUTE;
    await env.DB.prepare(
      "UPDATE todo_items SET title = 'sentinel' WHERE uid = 'event-assignment-4410001'",
    ).run();
    await run();
    // Same hash: the items weren't rewritten.
    expect(await titles()).toContain("sentinel");
    expect((await feed()).last_success_at).toBe(now().toISOString());
  });

  it("backs off after failures, doubling from 20 minutes", async () => {
    await connected();
    elms.fail(503);
    const waits: number[] = [];
    for (let i = 0; i < 3; i++) {
      clock = Date.parse((await feed()).next_fetch_at);
      await run();
      const row = await feed();
      expect(row).toMatchObject({
        status: "active",
        failure_count: i + 1,
        last_error: "http-503",
      });
      waits.push(Date.parse(row.next_fetch_at) - clock);
    }
    for (const [i, wait] of waits.entries()) {
      const base = 20 * MINUTE * 2 ** i;
      expect(wait).toBeGreaterThanOrEqual(base * 0.9);
      expect(wait).toBeLessThanOrEqual(base * 1.1);
    }
    // A success clears it.
    elms.serve(ELMS_FEED);
    clock = Date.parse((await feed()).next_fetch_at);
    await run();
    expect(await feed()).toMatchObject({ failure_count: 0, last_error: null });
  });

  it("marks a feed broken after three gone answers an hour apart, then stops", async () => {
    await connected();
    elms.fail(404);
    for (let i = 0; i < 3; i++) {
      clock = Math.max(Date.parse((await feed()).next_fetch_at), clock + HOUR);
      await run();
    }
    expect(await feed()).toMatchObject({
      status: "broken",
      gone_strikes: 3,
      last_error: "http-404",
    });
    const fetches = elms.requests.length;
    clock += DAY;
    await run();
    expect(elms.requests).toHaveLength(fetches);
    // The admin's health numbers see it.
    expect(await todoHealth(env.DB)).toMatchObject({
      active: 0,
      paused: 0,
      broken: 1,
    });
  });

  it("never breaks a feed for other failures", async () => {
    await connected();
    elms.fail(500);
    for (let i = 0; i < 6; i++) {
      clock = Date.parse((await feed()).next_fetch_at);
      await run();
    }
    expect(await feed()).toMatchObject({ status: "active", failure_count: 6 });
  });

  it("slows to 6 hours after two weeks, and pauses after 120 days unopened", async () => {
    await connected();
    await env.DB.prepare("UPDATE todo_feeds SET last_opened_at = ?1")
      .bind(at(clock - 15 * DAY))
      .run();
    clock += 20 * MINUTE;
    await run();
    expect((await feed()).next_fetch_at).toBe(at(clock + 6 * HOUR));

    await env.DB.prepare("UPDATE todo_feeds SET last_opened_at = ?1")
      .bind(at(clock - 121 * DAY))
      .run();
    clock += 6 * HOUR;
    await run();
    expect((await feed()).status).toBe("paused");
    const fetches = elms.requests.length;
    clock += 7 * DAY;
    await run();
    expect(elms.requests).toHaveLength(fetches);
  });

  it("takes at most a batch, the longest-waiting first", async () => {
    for (const user of ["tstudent", "tadmin"]) await connected(user);
    await env.DB.prepare(
      "UPDATE todo_feeds SET next_fetch_at = CASE user_id WHEN 'tadmin' THEN ?1 ELSE ?2 END",
    )
      .bind(at(clock - 2 * HOUR), at(clock - HOUR))
      .run();
    expect((await dueFeeds(env.DB, now(), 1)).map((r) => r.user_id)).toEqual([
      "tadmin",
    ]);
    expect(await dueFeeds(env.DB, now(), 400)).toHaveLength(2);
  });

  it("seals links under the new key as it touches them during a rotation", async () => {
    await connected();
    expect((await feed()).url_enc).toMatch(/^v1\.k1\./);
    testEnv = todoEnv({
      TODO_FEED_KEY: TEST_KEYS.k2,
      TODO_FEED_KEY_ID: "k2",
      TODO_FEED_KEY_PREVIOUS: TEST_KEYS.k1,
      TODO_FEED_KEY_PREVIOUS_ID: "k1",
    });
    clock += 20 * MINUTE;
    await run();
    expect(await feed()).toMatchObject({ failure_count: 0 });
    expect((await feed()).url_enc).toMatch(/^v1\.k2\./);
    // With the old key gone, the resealed row still works.
    testEnv = todoEnv({ TODO_FEED_KEY: TEST_KEYS.k2, TODO_FEED_KEY_ID: "k2" });
    clock += 20 * MINUTE;
    await run();
    expect(await feed()).toMatchObject({ failure_count: 0 });
    expect(elms.requests).toHaveLength(3);
  });

  it("reports a link it can't open, without breaking it", async () => {
    await connected();
    testEnv = todoEnv({ TODO_FEED_KEY: TEST_KEYS.k2, TODO_FEED_KEY_ID: "k2" });
    clock += 20 * MINUTE;
    await run();
    expect(await feed()).toMatchObject({
      status: "active",
      last_error: "key",
      failure_count: 1,
    });
    expect(elms.requests).toHaveLength(1);
  });

  it("runs in test mode with the fixture feed", async () => {
    testEnv = todoEnv({ AUTH_TEST_MODE: "true", TODO_FEED_KEY: "" });
    const phone = await device();
    const answer = await phone.request(
      "/api/todo/connect",
      {
        url: "https://elms.umd.edu/feeds/calendars/user_TerpsicleTestFeedCalendar0001.ics",
      },
      "http://localhost:3000",
    );
    expect(((await answer.json()) as { status: string }).status).toBe(
      "connected",
    );
    clock += DAY;
    await run();
    expect(await feed()).toMatchObject({
      failure_count: 0,
      url_enc: expect.stringMatching(/^v1\.test\./),
    });
    expect(elms.requests).toEqual([]);
  });
});

describe("the daily job's Todo pruning", () => {
  it("drops items due over 30 days ago and stale marks of gone items", async () => {
    const phone = await connected();
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410012",
      done: true,
    });
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    // An orphan mark: its item left the feed long ago.
    await env.DB.prepare(
      "INSERT INTO todo_done (user_id, uid, done_at) VALUES ('tstudent', 'gone', ?1)",
    )
      .bind(at(clock - 40 * DAY))
      .run();
    // "Syllabus quiz" (2026-08-31) is over 30 days old by October 5th.
    clock = Date.parse("2026-10-05T13:07:00.000Z");
    await runDailyJob({ env: testEnv, now: now() });
    expect(await titles()).not.toContain("Syllabus quiz");
    const marks = await env.DB.prepare(
      "SELECT uid FROM todo_done ORDER BY uid",
    ).all<{ uid: string }>();
    // The quiz's mark is only days old, so it waits; the orphan goes.
    expect(marks.results.map((r) => r.uid)).toEqual([
      "event-assignment-4410001",
      "event-assignment-4410012",
    ]);
  });
});
