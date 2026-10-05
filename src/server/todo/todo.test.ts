// Todo's routes end to end through the real router and D1 (docs/V3.md §3.2,
// §3.7, §3.8), with ELMS faked from the parser's synthetic feeds.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MeResult,
  TODO_MAX_TASKS,
  type TodoConnectResult,
  TodoConnectResultSchema,
  type TodoFileItem,
  type TodoImportFileResult,
  TodoListResultSchema,
  type TodoRefreshResult,
  TodoSaveTaskResultSchema,
} from "~/core/schema";
import { parseIcs, TEST_FEED_TOKENS, testFeedLink } from "~/core/todo";
import { type ApiEnv, handleApi } from "../api/router";
import { SealedDataError } from "../security/user-keys";
import { CONNECT_TIMEOUT_MS, FEED_TIMEOUT_MS } from "./fetch";
import { sweepUnsealedTasks } from "./store";
import {
  clearTodo,
  type Device,
  ELMS_FEED,
  FakeElms,
  FEED_TOKEN,
  FEED_URL,
  FILE_FEED,
  ORIGIN,
  openedTitleFor,
  signIn,
  todoEnv,
} from "./testing";

const MINUTE = 60_000;
let clock = Date.parse("2026-09-26T16:00:00.000Z");
const now = () => new Date(clock);
let elms: FakeElms;
let testEnv: ApiEnv;

beforeEach(async () => {
  clock = Date.parse("2026-09-26T16:00:00.000Z");
  elms = new FakeElms();
  testEnv = todoEnv();
  await clearTodo();
});

const device = (userId = "tstudent") =>
  signIn(userId, { now, env: () => testEnv, elms });

const connect = async (phone: Device, url = FEED_URL) =>
  TodoConnectResultSchema.parse(await phone.call("/api/todo/connect", { url }));

const list = async (phone: Device, from = "2026-08-01", to = "2026-11-28") =>
  TodoListResultSchema.parse(await phone.call("/api/todo/list", { from, to }));

const feedRow = () =>
  env.DB.prepare(
    "SELECT status, next_fetch_at, last_opened_at, url_enc, item_count FROM todo_feeds",
  ).first<{
    status: string;
    next_fetch_at: string;
    last_opened_at: string;
    url_enc: string;
    item_count: number;
  }>();

const fileItems = (): TodoFileItem[] =>
  parseIcs(FILE_FEED, "file").items.map((i) => ({
    uid: i.uid,
    title: i.title,
    courseLabel: i.courseLabel,
    kind: i.kind,
    dueAt: i.dueAt,
    dueDate: i.dueDate,
    link: i.link,
  }));

describe("who may call todo/*", () => {
  it("is unavailable while TODO_ENABLED is off or the key is missing", async () => {
    const phone = await device();
    testEnv = todoEnv({ TODO_ENABLED: "off" });
    expect(
      (
        await phone.request("/api/todo/list", {
          from: "2026-09-01",
          to: "2026-09-30",
        })
      ).status,
    ).toBe(503);
    testEnv = todoEnv({ TODO_FEED_KEY: "" });
    expect(
      (await phone.request("/api/todo/connect", { url: FEED_URL })).status,
    ).toBe(503);
    expect(elms.requests).toEqual([]);
  });

  it("needs a session and the same origin", async () => {
    const phone = await device();
    expect((await raw({ origin: ORIGIN })).status).toBe(401);
    expect(
      (await raw({ origin: "https://evil.example", cookie: phone.cookie }))
        .status,
    ).toBe(403);
    expect(elms.requests).toEqual([]);
  });

  it("tells /api/me whether Todo is on", async () => {
    const phone = await device();
    const flags = async () =>
      (
        (await phone.call("/api/me")) as Extract<
          MeResult,
          { status: "signed-in" }
        >
      ).flags.todo;
    expect(await flags()).toBe(true);
    testEnv = todoEnv({ TODO_FEED_KEY: "" });
    expect(await flags()).toBe(false);
    testEnv = todoEnv({ TODO_ENABLED: "off" });
    expect(await flags()).toBe(false);
  });

  it("limits connecting to 10 an hour per person", async () => {
    const phone = await device();
    for (let i = 0; i < 10; i++)
      expect(
        (await phone.request("/api/todo/connect", { url: "nope" })).status,
      ).toBe(200);
    expect(
      (await phone.request("/api/todo/connect", { url: "nope" })).status,
    ).toBe(429);
  });
});

/** A connect request without the device's usual headers. */
function raw(options: { origin: string; cookie?: string }) {
  return handleApi(
    new Request(`${ORIGIN}/api/todo/connect`, {
      method: "POST",
      body: JSON.stringify({ url: FEED_URL }),
      headers: {
        "Content-Type": "application/json",
        Origin: options.origin,
        ...(options.cookie ? { Cookie: options.cookie } : {}),
      },
    }),
    testEnv,
    { waitUntil: () => {} },
    now(),
    { fetch: elms.fetch },
  );
}

describe("todo/connect", () => {
  it("refuses anything but an ELMS feed link, without fetching or echoing it", async () => {
    const phone = await device();
    for (const url of [
      "https://evil.example/feeds/calendars/user_abcdefghijklmnopqrstuvwxyz.ics",
      `${FEED_URL}?x=1`,
      FEED_URL.replace("https://", "http://"),
      "https://elms.umd.edu/feeds/calendars/user_short.ics",
      "",
    ]) {
      const answer = await phone.request("/api/todo/connect", { url });
      const text = await answer.text();
      expect(JSON.parse(text)).toEqual({ status: "invalid-link" });
      expect(text).not.toContain("user_");
    }
    expect(elms.requests).toEqual([]);
    expect(await feedRow()).toBeNull();
  });

  it("says why a first fetch failed and stores nothing", async () => {
    const phone = await device();
    elms.fail(503);
    expect(await connect(phone)).toEqual({
      status: "unreachable",
      reason: "http-503",
    });
    elms.answer = () => {
      throw new TypeError("connection reset");
    };
    expect(await connect(phone)).toEqual({
      status: "unreachable",
      reason: "network",
    });
    elms.fail(404);
    expect(await connect(phone)).toEqual({
      status: "not-a-calendar",
      reason: "http-404",
    });
    elms.fail(403);
    expect(await connect(phone)).toEqual({
      status: "not-a-calendar",
      reason: "http-403",
    });
    elms.answer = () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/feed.ics" },
      });
    expect(await connect(phone)).toEqual({
      status: "not-a-calendar",
      reason: "bad-redirect",
    });
    elms.answer = () =>
      new Response("BEGIN:VCALENDAR", {
        headers: { "Content-Length": String(6 * 1_048_576) },
      });
    expect(await connect(phone)).toEqual({
      status: "not-a-calendar",
      reason: "too-large",
    });
    elms.serve("<!doctype html><title>Log in</title>");
    expect(await connect(phone)).toEqual({
      status: "not-a-calendar",
      reason: "not-recognized",
    });
    expect(await feedRow()).toBeNull();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM todo_items").first("n"),
    ).toBe(0);
  });

  it("stores the link encrypted and answers with the feed and its items", async () => {
    const phone = await device();
    // Some browsers copy webcal://.
    const result = await connect(
      phone,
      FEED_URL.replace("https://", "webcal://"),
    );
    expect(elms.requests.map((r) => r.url)).toEqual([FEED_URL]);
    if (result.status !== "connected") throw new Error(result.status);
    expect(result.feed).toEqual({
      source: "elms",
      status: "active",
      lastSuccessAt: now().toISOString(),
      lastFetchAt: now().toISOString(),
      lastError: null,
      itemCount: 15,
    });
    expect(result.items).toHaveLength(15);
    expect(result.items[0]).toMatchObject({
      title: "Syllabus quiz",
      dueDate: "2026-08-31",
    });
    const byTitle = new Map(result.items.map((i) => [i.title, i]));
    // Course matching: the first code of a cross-listing, and none for a
    // personal calendar.
    expect(byTitle.get("Problem Set 3")).toMatchObject({
      courseCode: "CMSC216",
      sectionCode: null,
    });
    expect(byTitle.get("Project 2")).toMatchObject({
      courseCode: "CMSC216",
      sectionCode: "0103",
      kind: "assignment",
      dueAt: "2026-09-30T03:59:00.000Z",
    });
    expect(byTitle.get("Advising appointment")).toMatchObject({
      courseCode: null,
      courseLabel: "Sam Testudo",
      kind: "event",
    });
    // Nothing about an item comes from its description, and there's no
    // Gradescope or exam guess to send.
    expect(byTitle.get("Homework 4")).toEqual(
      expect.not.objectContaining({ gradescope: expect.anything() }),
    );
    expect(result.items.every((i) => !("exam" in i))).toBe(true);

    const row = await feedRow();
    expect(row).toMatchObject({
      status: "active",
      next_fetch_at: new Date(clock + 20 * MINUTE).toISOString(),
      last_opened_at: now().toISOString(),
      item_count: 15,
    });
    expect(row?.url_enc).toMatch(/^v1\.k1\./);
    expect(row?.url_enc).not.toContain(FEED_TOKEN);
  });

  it("fetches a link pasted on elms.umd.edu from umd.instructure.com", async () => {
    const phone = await device();
    const pasted = FEED_URL.replace("umd.instructure.com", "elms.umd.edu");
    const result = await connect(phone, pasted);
    expect(result.status).toBe("connected");
    expect(elms.requests.map((r) => r.url)).toEqual([FEED_URL]);
  });

  it("waits longer for ELMS than a refresh does, then says it took too long", async () => {
    const phone = await device();
    let settled = false;
    elms.answer = (request) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const answer = connect(phone).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(FEED_TIMEOUT_MS + 1_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      expect(await answer).toEqual({
        status: "unreachable",
        reason: "timeout",
      });
    } finally {
      vi.useRealTimers();
    }
    expect(await feedRow()).toBeNull();
  });

  it("keeps done marks when reconnecting, for items that come back", async () => {
    const phone = await device();
    await connect(phone);
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410002",
      done: true,
    });
    // The new link's feed no longer has WebAssign 5.
    elms.serve(
      ELMS_FEED.replace(
        "UID:event-assignment-4410002",
        "UID:event-assignment-4410099",
      ),
    );
    clock += 60 * MINUTE;
    await connect(phone);
    expect((await list(phone)).done).toEqual(["event-assignment-4410001"]);
    const marks = await env.DB.prepare(
      "SELECT uid FROM todo_done ORDER BY uid",
    ).all();
    // The mark stays (pruning takes it later) in case the item comes back.
    expect(marks.results.map((r) => r.uid)).toEqual([
      "event-assignment-4410001",
      "event-assignment-4410002",
    ]);
  });
});

describe("todo/list and todo/done", () => {
  it("lists a range with its done marks, soonest first", async () => {
    const phone = await device();
    expect(await list(phone)).toEqual({
      feed: null,
      items: [],
      done: [],
      hidden: [],
    });
    await connect(phone);
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410008",
      done: true,
    });
    const week = await list(phone, "2026-09-28", "2026-10-04");
    expect(week.items.map((i) => [i.dueDate, i.title])).toEqual([
      ["2026-09-29", "Project 2"],
      ["2026-09-30", "WebAssign 5"],
      ["2026-10-02", "Quiz 3"],
    ]);
    expect(week.done).toEqual(["event-assignment-4410001"]);
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: false,
    });
    expect((await list(phone, "2026-09-28", "2026-10-04")).done).toEqual([]);
  });

  it("only marks items the person has", async () => {
    const phone = await device();
    await connect(phone);
    const other = await device("tadmin");
    await other.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    await phone.call("/api/todo/done", { uid: "nothing-like-it", done: true });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM todo_done").first("n"),
    ).toBe(0);
  });

  it("refuses more than 120 days", async () => {
    const phone = await device();
    expect(
      (
        await phone.request("/api/todo/list", {
          from: "2026-09-01",
          to: "2027-01-01",
        })
      ).status,
    ).toBe(400);
  });

  it("notes the opening at most hourly, and resumes a paused feed", async () => {
    const phone = await device();
    await connect(phone);
    clock += 30 * MINUTE;
    await list(phone);
    expect((await feedRow())?.last_opened_at).toBe("2026-09-26T16:00:00.000Z");
    clock += 31 * MINUTE;
    await list(phone);
    expect((await feedRow())?.last_opened_at).toBe(now().toISOString());

    await env.DB.prepare(
      "UPDATE todo_feeds SET status = 'paused', next_fetch_at = '2026-09-26T00:00:00.000Z'",
    ).run();
    clock += 5 * MINUTE;
    const answer = await list(phone);
    expect(answer.feed?.status).toBe("active");
    expect(await feedRow()).toMatchObject({
      status: "active",
      next_fetch_at: now().toISOString(),
    });
  });
});

describe("todo/refresh", () => {
  it("fetches at most every 5 minutes, conditionally", async () => {
    const phone = await device();
    const nothing = await phone.call<TodoRefreshResult>("/api/todo/refresh");
    expect(nothing).toEqual({ status: "failed", feed: null });
    await connect(phone);
    clock += 4 * MINUTE;
    expect(
      (await phone.call<TodoRefreshResult>("/api/todo/refresh")).status,
    ).toBe("too-soon");
    expect(elms.requests).toHaveLength(1);
    clock += 1 * MINUTE;
    const fresh = await phone.call<TodoRefreshResult>("/api/todo/refresh");
    expect(fresh.status).toBe("fetched");
    expect(fresh.feed?.lastFetchAt).toBe(now().toISOString());
    // The stored ETag went with it, and ELMS said nothing changed.
    expect(elms.requests[1]?.headers.get("If-None-Match")).toBe('"v1"');
  });

  it("writes a changed feed and reports a failure's code", async () => {
    const phone = await device();
    await connect(phone);
    clock += 10 * MINUTE;
    // Both copies: the fixture repeats the event with a higher SEQUENCE.
    elms.serve(
      ELMS_FEED.replaceAll(
        "SUMMARY:Project 2 [",
        "SUMMARY:Project 2 (extended) [",
      ),
    );
    expect(
      (await phone.call<TodoRefreshResult>("/api/todo/refresh")).status,
    ).toBe("fetched");
    expect(
      (await list(phone, "2026-09-29", "2026-09-29")).items[0]?.title,
    ).toBe("Project 2 (extended)");
    clock += 10 * MINUTE;
    elms.fail(502);
    const failed = await phone.call<TodoRefreshResult>("/api/todo/refresh");
    expect(failed).toMatchObject({
      status: "failed",
      feed: { status: "active", lastError: "http-502" },
    });
  });

  it("doesn't fetch a broken feed", async () => {
    const phone = await device();
    await connect(phone);
    await env.DB.prepare("UPDATE todo_feeds SET status = 'broken'").run();
    clock += 10 * MINUTE;
    const answer = await phone.call<TodoRefreshResult>("/api/todo/refresh");
    expect(answer).toMatchObject({
      status: "failed",
      feed: { status: "broken" },
    });
    expect(elms.requests).toHaveLength(1);
  });
});

describe("todo/import-file", () => {
  it("stores a dropped file's items, marked as from a file", async () => {
    const phone = await device();
    const items = fileItems();
    const result = await phone.call<TodoImportFileResult>(
      "/api/todo/import-file",
      {
        items,
      },
    );
    expect(result).toEqual({ status: "imported", added: 9, skipped: 0 });
    const stored = (await list(phone, "2026-09-01", "2026-12-29")).items;
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((i) => i.source === "file")).toBe(true);
    // Links are ELMS's or nothing.
    expect(
      stored.every(
        (i) => i.link === null || i.link.startsWith("https://elms.umd.edu/"),
      ),
    ).toBe(true);
  });

  it("never replaces the ELMS feed's items, and a new file replaces the last", async () => {
    const phone = await device();
    await connect(phone);
    const first = fileItems();
    const clash: TodoFileItem = {
      uid: "event-assignment-4410001",
      title: "Project 2 from a file",
      courseLabel: null,
      kind: "assignment",
      dueAt: null,
      dueDate: "2026-09-29",
      link: null,
    };
    const result = await phone.call<TodoImportFileResult>(
      "/api/todo/import-file",
      {
        items: [...first, clash],
      },
    );
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    const project = (await list(phone, "2026-09-29", "2026-09-29")).items.find(
      (i) => i.uid === clash.uid,
    );
    expect(project).toMatchObject({ source: "elms", title: "Project 2" });

    const only = first.slice(0, 1);
    await phone.call("/api/todo/import-file", { items: only });
    const files = await env.DB.prepare(
      "SELECT uid FROM todo_items WHERE source = 'file'",
    ).all();
    expect(files.results.map((r) => r.uid)).toEqual(only.map((i) => i.uid));
  });

  it("takes only structured items, never the file or descriptions", async () => {
    const phone = await device();
    const [item] = fileItems();
    expect(
      (
        await phone.request("/api/todo/import-file", {
          items: [{ ...item, description: "Room 1116" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (await phone.request("/api/todo/import-file", { text: FILE_FEED }))
        .status,
    ).toBe(400);
  });
});

describe("todo/disconnect", () => {
  it("deletes the link, its items and their done marks at once", async () => {
    const phone = await device();
    await connect(phone);
    const [fileItem] = fileItems();
    if (!fileItem) throw new Error("no file items");
    await phone.call("/api/todo/import-file", { items: [fileItem] });
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    await phone.call("/api/todo/done", { uid: fileItem.uid, done: true });
    expect(await phone.call("/api/todo/disconnect")).toEqual({
      status: "disconnected",
    });
    expect(await feedRow()).toBeNull();
    const left = await env.DB.prepare(
      "SELECT i.uid, d.uid AS done FROM todo_items i LEFT JOIN todo_done d USING (user_id, uid)",
    ).all();
    expect(left.results).toEqual([{ uid: fileItem.uid, done: fileItem.uid }]);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM todo_done").first("n"),
    ).toBe(1);
  });
});

describe("todo/hide-course", () => {
  const hide = (phone: Device, key: string, hidden = true) =>
    phone.call("/api/todo/hide-course", { key, hidden });

  it("keeps the person's hidden courses, and shows one again", async () => {
    const phone = await device();
    await connect(phone);
    expect(await hide(phone, "CMSC216")).toEqual({ status: "ok" });
    await hide(phone, "Terps Robotics Club");
    // Hiding twice is still one.
    await hide(phone, "CMSC216");
    expect((await list(phone)).hidden).toEqual([
      "CMSC216",
      "Terps Robotics Club",
    ]);
    // The items are still listed: the app leaves them out.
    expect((await list(phone)).items.length).toBeGreaterThan(0);
    await hide(phone, "CMSC216", false);
    expect((await list(phone)).hidden).toEqual(["Terps Robotics Club"]);
    // Another person's list is their own.
    expect((await list(await device("tadmin"))).hidden).toEqual([]);
    // It's a preference: disconnecting ELMS keeps it.
    await phone.call("/api/todo/disconnect");
    expect((await list(phone)).hidden).toEqual(["Terps Robotics Club"]);
  });

  it("keeps at most 100", async () => {
    const phone = await device();
    await env.DB.prepare(
      `WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < 100)
       INSERT INTO todo_hidden (user_id, course_key, hidden_at)
       SELECT 'tstudent', 'Club ' || value, ?1 FROM n`,
    )
      .bind(now().toISOString())
      .run();
    await hide(phone, "CMSC216");
    expect((await list(phone)).hidden).not.toContain("CMSC216");
    expect(
      (await phone.request("/api/todo/hide-course", { key: "", hidden: true }))
        .status,
    ).toBe(400);
  });
});

describe("own tasks", () => {
  const task = (overrides: Record<string, unknown> = {}) => ({
    uid: "own-5b0c2a4e-7d1f",
    title: "Office hours with Dr. Kim",
    courseCode: "CMSC216",
    dueDate: "2026-09-29",
    dueTime: 14 * 60,
    ...overrides,
  });
  const save = async (phone: Device, overrides: Record<string, unknown> = {}) =>
    TodoSaveTaskResultSchema.parse(
      await phone.call("/api/todo/save-task", task(overrides)),
    );

  it("adds a task that's yours, lists it beside the feed, and changes it in place", async () => {
    const phone = await device();
    await connect(phone);
    expect(await save(phone)).toEqual({
      status: "saved",
      item: {
        uid: "own-5b0c2a4e-7d1f",
        source: "own",
        title: "Office hours with Dr. Kim",
        courseLabel: null,
        courseCode: "CMSC216",
        sectionCode: null,
        kind: "assignment",
        dueAt: "2026-09-29T18:00:00.000Z",
        dueDate: "2026-09-29",
        link: null,
      },
    });
    const week = await list(phone, "2026-09-28", "2026-10-04");
    expect(week.items.map((i) => [i.source, i.title])).toContainEqual([
      "own",
      "Office hours with Dr. Kim",
    ]);

    // The same uid is the same task: a new title and no date, not a second one.
    await save(phone, { title: "Office hours", dueDate: null, dueTime: null });
    const rows = await env.DB.prepare(
      "SELECT title, due_at, due_date FROM todo_tasks",
    ).all<{ title: string }>();
    expect(rows.results).toEqual([
      {
        title: expect.stringMatching(/^v1\.acct\./),
        due_at: null,
        due_date: null,
      },
    ]);
    // What was typed is sealed with the account's key, bound to the task.
    const sealed = rows.results[0]?.title ?? "";
    expect(sealed).not.toContain("Office");
    expect(await openedTitleFor(testEnv, "tstudent", task().uid, sealed)).toBe(
      "Office hours",
    );
    await expect(
      openedTitleFor(testEnv, "tstudent", "own-another-task", sealed),
    ).rejects.toThrow(SealedDataError);
    // No date: listed whatever the range asks for.
    const later = await list(phone, "2026-12-01", "2026-12-31");
    expect(later.items.map((i) => [i.title, i.dueDate])).toEqual([
      ["Office hours", null],
    ]);
  });

  it("deletes a task saved in plain text (between the migration and the deploy) on sight", async () => {
    const phone = await device();
    await save(phone);
    // The Worker from before 0025_sync_encryption saved this one.
    await env.DB.prepare(
      `INSERT INTO todo_tasks (user_id, uid, title, course_code, due_at, due_date, created_at, updated_at)
       VALUES ('tstudent', 'own-plain-task-01', 'Typed during deploy', NULL, NULL, '2026-09-29', ?1, ?1)`,
    )
      .bind(now().toISOString())
      .run();
    await phone.call("/api/todo/done", {
      uid: "own-plain-task-01",
      done: true,
    });
    // Nothing throws: the plain one is gone, with its mark; the rest stay.
    const week = await list(phone, "2026-09-28", "2026-10-04");
    expect(
      week.items.flatMap((i) => (i.source === "own" ? [i.title] : [])),
    ).toEqual(["Office hours with Dr. Kim"]);
    const rows = await env.DB.prepare(
      "SELECT uid FROM todo_tasks UNION ALL SELECT uid FROM todo_done",
    ).all<{ uid: string }>();
    expect(rows.results.map((r) => r.uid)).toEqual([task().uid]);
    // One nobody lists (out of every range asked for) goes with the daily sweep.
    await env.DB.prepare(
      `INSERT INTO todo_tasks (user_id, uid, title, course_code, due_at, due_date, created_at, updated_at)
       VALUES ('tstudent', 'own-plain-task-02', 'Also typed during deploy', NULL, NULL, '2027-01-04', ?1, ?1)`,
    )
      .bind(now().toISOString())
      .run();
    expect(await sweepUnsealedTasks(env.DB)).toBe(1);
    expect(await sweepUnsealedTasks(env.DB)).toBe(0);
  });

  it("works without ELMS, takes done marks, and deletes a task with its mark", async () => {
    const phone = await device();
    await save(phone);
    await phone.call("/api/todo/done", { uid: task().uid, done: true });
    expect(await list(phone)).toMatchObject({
      feed: null,
      done: [task().uid],
    });
    expect(
      await phone.call("/api/todo/delete-task", { uid: task().uid }),
    ).toEqual({ status: "ok" });
    expect(await list(phone)).toEqual({
      feed: null,
      items: [],
      done: [],
      hidden: [],
    });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM todo_done").first("n"),
    ).toBe(0);
  });

  it("never touches another person's task, or anything from ELMS", async () => {
    const phone = await device();
    await connect(phone);
    await save(phone);
    await phone.call("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });
    const other = await device("tadmin");
    await other.call("/api/todo/delete-task", { uid: task().uid });
    await other.call("/api/todo/done", { uid: task().uid, done: true });
    expect(await list(other)).toEqual({
      feed: null,
      items: [],
      done: [],
      hidden: [],
    });
    expect((await list(phone)).items.map((i) => i.uid)).toContain(task().uid);
    // Only an own task's uid is taken.
    expect(
      (
        await phone.request("/api/todo/delete-task", {
          uid: "event-assignment-4410001",
        })
      ).status,
    ).toBe(400);
    expect((await list(phone)).done).toEqual(["event-assignment-4410001"]);
  });

  it("keeps dates Todo keeps, and at most 500 tasks", async () => {
    const phone = await device();
    expect(await save(phone, { dueDate: "2026-08-01" })).toEqual({
      status: "out-of-range",
    });
    expect(await save(phone, { dueDate: "2027-12-01" })).toEqual({
      status: "out-of-range",
    });
    await env.DB.prepare(
      `WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM n WHERE value < ?2)
       INSERT INTO todo_tasks (user_id, uid, title, created_at, updated_at)
       SELECT 'tstudent', 'own-seeded-' || printf('%04d', value), 'Seeded', ?1, ?1
       FROM n`,
    )
      .bind(now().toISOString(), TODO_MAX_TASKS)
      .run();
    expect(await save(phone)).toEqual({ status: "too-many" });
    // Changing one you have still works.
    expect(
      (await save(phone, { uid: "own-seeded-0001", title: "Changed" })).status,
    ).toBe("saved");
  });

  it("stays when ELMS is disconnected, with its done mark", async () => {
    const phone = await device();
    await connect(phone);
    await save(phone);
    await phone.call("/api/todo/done", { uid: task().uid, done: true });
    await phone.call("/api/todo/disconnect");
    expect(await list(phone)).toMatchObject({
      feed: null,
      items: [{ uid: task().uid, source: "own" }],
      done: [task().uid],
    });
  });
});

describe("test mode", () => {
  const LOCAL = "http://localhost:3000";

  it("uses the fixed key and the fixture feed, never the network", async () => {
    testEnv = todoEnv({ AUTH_TEST_MODE: "true", TODO_FEED_KEY: "" });
    const phone = await device();
    const at = (path: string, body: unknown) =>
      phone.request(path, body, LOCAL).then((r) => r.json());
    const connected = (await at("/api/todo/connect", {
      url: testFeedLink(TEST_FEED_TOKENS.calendar),
    })) as TodoConnectResult;
    expect(connected.status).toBe("connected");
    if (connected.status !== "connected") return;
    expect(connected.items.map((i) => i.dueDate)).toContain("2026-09-27");
    expect((await feedRow())?.url_enc).toMatch(/^v1\.test\./);
    expect(
      await at("/api/todo/connect", {
        url: testFeedLink(TEST_FEED_TOKENS.gone),
      }),
    ).toEqual({ status: "not-a-calendar", reason: "http-404" });
    expect(
      await at("/api/todo/connect", {
        url: testFeedLink(TEST_FEED_TOKENS.notCalendar),
      }),
    ).toEqual({ status: "not-a-calendar", reason: "not-recognized" });
    expect(elms.requests).toEqual([]);
    // terpsicle.com never gets test mode: without a key, it's off.
    expect(
      (
        await phone.request("/api/todo/list", {
          from: "2026-09-01",
          to: "2026-09-30",
        })
      ).status,
    ).toBe(503);
  });
});
