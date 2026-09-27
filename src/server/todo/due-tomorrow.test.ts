// "Due tomorrow" (docs/V3.md §4) through the real Todo cron, router and D1,
// with ELMS and the push service faked: turned on at connect, sent by the
// run that crosses 6pm in New York (in daylight and standard time), once a
// day, only for what's open and only from a fresh feed.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
} from "~/core/push";
import { type PushPayload, TodoConnectResultSchema } from "~/core/schema";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettingsResult,
} from "~/core/schema/notifications";
import { runTodoFeedsJob } from "~/jobs/todo-feeds";
import { TEST_VAPID_KEYS } from "../push/config";
import { resetPushCachesForTests } from "../push/send";
import { sendDueTomorrow } from "./due-tomorrow";
import {
  clearTodo,
  type Device,
  FakeElms,
  FEED_URL,
  signIn,
  todoEnv,
} from "./testing";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
let clock = 0;
const now = () => new Date(clock);
let elms: FakeElms;

/** Todo on, and push on with test mode's key pair (production's stand-in here). */
const testEnv = () =>
  todoEnv({
    PUSH_ENABLED: "true",
    VAPID_PUBLIC_KEY: TEST_VAPID_KEYS.publicKey,
    VAPID_PRIVATE_KEY: TEST_VAPID_KEYS.privateKey,
    VAPID_SUBJECT: "mailto:alerts@terpsicle.com",
  });

/** A feed of assignments due at these instants (UTC), in CMSC216. */
function feedOf(items: { id: string; title: string; due: string }[]): string {
  const stamp = (iso: string) =>
    iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "PRODID:icalendar-ruby",
    "VERSION:2.0",
    ...items.flatMap((item) => [
      "BEGIN:VEVENT",
      `DTSTART:${stamp(item.due)}`,
      `DTEND:${stamp(item.due)}`,
      `SUMMARY:${item.title} [CMSC216-0103: Introduction to Computer Systems]`,
      `UID:event-assignment-${item.id}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** One device's subscription on a fake FCM, with its key to read pushes. */
async function aPhone() {
  const pair = await generateKeyPair("ECDH", true);
  const uaPublic = await exportPublicKey(pair.publicKey);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  const endpoint = `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
  const received: PushPayload[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== endpoint) return elms.fetch(input, init);
    const plain = await decryptPushPayload({
      body: new Uint8Array(await request.arrayBuffer()),
      uaPrivate: pair.privateKey,
      uaPublic,
      authSecret,
    });
    if (plain) received.push(JSON.parse(new TextDecoder().decode(plain)));
    return new Response(null, { status: 201 });
  };
  return {
    endpoint,
    keys: { p256dh: toBase64url(uaPublic), auth: toBase64url(authSecret) },
    received,
    fetch,
  };
}

let phone: Awaited<ReturnType<typeof aPhone>>;

beforeEach(async () => {
  elms = new FakeElms();
  resetPushCachesForTests();
  await clearTodo();
  phone = await aPhone();
});

/** tstudent, with a device and ELMS connected at `clock`. */
async function connected(feed: string): Promise<Device> {
  elms.serve(feed);
  const device = await signIn("tstudent", { now, env: testEnv, elms });
  expect(
    await device.call("/api/push/subscribe", {
      endpoint: phone.endpoint,
      keys: phone.keys,
    }),
  ).toEqual({ status: "ok" });
  const answer = TodoConnectResultSchema.parse(
    await device.call("/api/todo/connect", { url: FEED_URL }),
  );
  expect(answer.status).toBe("connected");
  return device;
}

/** The Todo cron at `iso` (its runs are at :03, :23 and :43). */
async function runAt(iso: string) {
  clock = Date.parse(iso);
  await runTodoFeedsJob({ env: testEnv(), now: now(), fetch: phone.fetch });
}

const settingsOf = (device: Device) =>
  device.call<NotificationSettingsResult>("/api/notifications/settings");

describe("turning it on", () => {
  it("comes on when ELMS connects, and stays as the person leaves it", async () => {
    clock = Date.parse("2026-09-28T16:00:00Z");
    const device = await signIn("tstudent", { now, env: testEnv, elms });
    expect(await settingsOf(device)).toEqual({
      settings: DEFAULT_NOTIFICATION_SETTINGS,
      todoConnected: false,
    });
    await device.call("/api/todo/connect", { url: FEED_URL });
    expect(await settingsOf(device)).toEqual({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: true } },
      todoConnected: true,
    });
    // Turned off, then the same link pasted again: still off.
    await device.call("/api/notifications/settings/set", {
      settings: DEFAULT_NOTIFICATION_SETTINGS,
    });
    await device.call("/api/todo/connect", { url: FEED_URL });
    expect((await settingsOf(device)).settings.todoDue.push).toBe(false);
  });
});

describe("the 6pm send", () => {
  // Monday, Sep 28 2026, in daylight time: 6pm in New York is 22:00 UTC.
  const TWO_DUE_TUESDAY = feedOf([
    { id: "1", title: "Project 2", due: "2026-09-30T03:59:00Z" },
    { id: "2", title: "Lab 4", due: "2026-09-29T17:00:00Z" },
    { id: "3", title: "Quiz 3", due: "2026-10-01T03:59:00Z" },
  ]);

  it("sends from the run that crosses 6pm, once that day", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    await connected(TWO_DUE_TUESDAY);
    await runAt("2026-09-28T21:43:00Z"); // 5:43pm
    expect(phone.received).toEqual([]);
    await runAt("2026-09-28T22:03:00Z"); // 6:03pm
    expect(phone.received).toEqual([
      {
        v: 1,
        type: "todo-due",
        title: "2 things due tomorrow",
        body: "Lab 4 (CMSC216) 1pm and Project 2 (CMSC216) 11:59pm",
        url: "/todo?day=2026-09-29",
        tag: "todo-due",
      },
    ]);
    // Later runs that evening, and after 8pm when UTC is on the next day.
    await runAt("2026-09-28T22:23:00Z");
    await runAt("2026-09-29T03:43:00Z"); // 11:43pm
    expect(phone.received).toHaveLength(1);
    // The next evening is about Wednesday.
    await runAt("2026-09-29T21:43:00Z");
    expect(phone.received).toHaveLength(1);
    await runAt("2026-09-29T22:03:00Z");
    expect(phone.received[1]).toMatchObject({
      title: "Quiz 3 is due tomorrow",
      body: "CMSC216 · 11:59pm",
      url: "/todo?day=2026-09-30",
    });
    expect(
      (
        await env.DB.prepare(
          "SELECT dedupe_key, status FROM notification_deliveries ORDER BY dedupe_key",
        ).all()
      ).results,
    ).toEqual([
      { dedupe_key: "todo-due:tstudent:2026-09-28:push", status: "sent" },
      { dedupe_key: "todo-due:tstudent:2026-09-29:push", status: "sent" },
    ]);
  });

  it("waits for 23:00 UTC in standard time, and on the day daylight time ends", async () => {
    clock = Date.parse("2026-10-31T20:00:00Z");
    await connected(
      feedOf([
        { id: "1", title: "Project 3", due: "2026-11-03T04:59:00Z" },
        { id: "2", title: "Homework 9", due: "2026-12-03T04:59:00Z" },
      ]),
    );
    // Sunday, Nov 1: standard time since 2am, so 22:03 UTC is 5:03pm.
    await runAt("2026-11-01T22:03:00Z");
    await runAt("2026-11-01T22:43:00Z");
    expect(phone.received).toEqual([]);
    await runAt("2026-11-01T23:03:00Z");
    expect(phone.received.map((p) => p.title)).toEqual([
      "Project 3 is due tomorrow",
    ]);
    // Tuesday, Dec 1.
    await runAt("2026-12-01T22:03:00Z");
    expect(phone.received).toHaveLength(1);
    await runAt("2026-12-01T23:03:00Z");
    expect(phone.received[1]?.title).toBe("Homework 9 is due tomorrow");
  });

  it("catches up at the next run when the one after 6pm didn't send", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    await connected(TWO_DUE_TUESDAY);
    await runAt("2026-09-28T22:23:00Z");
    expect(phone.received).toHaveLength(1);
  });

  it("leaves out what's done, and says nothing when all of it is", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    const device = await connected(TWO_DUE_TUESDAY);
    await device.call("/api/todo/done", {
      uid: "event-assignment-2",
      done: true,
    });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received.map((p) => p.title)).toEqual([
      "Project 2 is due tomorrow",
    ]);
  });

  it("never reminds about a course the person hid", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    const device = await connected(TWO_DUE_TUESDAY);
    await device.call("/api/todo/hide-course", {
      key: "Terps Robotics Club",
      hidden: true,
    });
    await device.call("/api/todo/hide-course", {
      key: "CMSC216",
      hidden: true,
    });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received).toEqual([]);
    // Shown again, it reminds the next evening.
    await device.call("/api/todo/hide-course", {
      key: "CMSC216",
      hidden: false,
    });
    await runAt("2026-09-29T22:03:00Z");
    expect(phone.received.map((p) => p.title)).toEqual([
      "Quiz 3 is due tomorrow",
    ]);
  });

  it("never reminds about an own task in a course the person hid", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    // Nothing on the feed is due Tuesday: only the task could remind.
    const device = await connected(
      feedOf([{ id: "3", title: "Quiz 3", due: "2026-10-01T03:59:00Z" }]),
    );
    await device.call("/api/todo/save-task", {
      uid: "own-club-meeting-01",
      title: "Robotics build night",
      courseCode: "CMSC216",
      dueDate: "2026-09-29",
      dueTime: null,
    });
    await device.call("/api/todo/hide-course", {
      key: "CMSC216",
      hidden: true,
    });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received).toEqual([]);
  });

  it("counts your own tasks due tomorrow like the feed's, until they're done", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    // Nothing on the feed is due Tuesday: only the tasks can remind.
    const device = await connected(
      feedOf([{ id: "3", title: "Quiz 3", due: "2026-10-01T03:59:00Z" }]),
    );
    const task = (uid: string, title: string, dueTime: number | null) =>
      device.call("/api/todo/save-task", {
        uid,
        title,
        courseCode: null,
        dueDate: "2026-09-29",
        dueTime,
      });
    await task("own-office-hours-01", "Office hours", 14 * 60);
    await task("own-return-books-01", "Return library books", null);
    await device.call("/api/todo/save-task", {
      uid: "own-someday-000001",
      title: "Someday",
      courseCode: null,
      dueDate: null,
      dueTime: null,
    });
    await device.call("/api/todo/done", {
      uid: "own-return-books-01",
      done: true,
    });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received.map((p) => [p.title, p.body])).toEqual([
      ["Office hours is due tomorrow", "2pm"],
    ]);
  });

  it("says nothing when everything due tomorrow is done", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    const device = await connected(TWO_DUE_TUESDAY);
    for (const uid of ["event-assignment-1", "event-assignment-2"])
      await device.call("/api/todo/done", { uid, done: true });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received).toEqual([]);
  });

  it("says nothing with the reminder off, or from a feed that's gone stale", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    const device = await connected(TWO_DUE_TUESDAY);
    await device.call("/api/notifications/settings/set", {
      settings: DEFAULT_NOTIFICATION_SETTINGS,
    });
    await runAt("2026-09-28T22:03:00Z");
    expect(phone.received).toEqual([]);

    await device.call("/api/notifications/settings/set", {
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: true } },
    });
    // ELMS hasn't answered for over 26 hours: the items may be wrong.
    elms.fail(503);
    await env.DB.prepare("UPDATE todo_feeds SET last_success_at = ?1")
      .bind(
        new Date(Date.parse("2026-09-28T22:23:00Z") - 27 * HOUR).toISOString(),
      )
      .run();
    await runAt("2026-09-28T22:23:00Z");
    expect(phone.received).toEqual([]);
  });
});

describe("who's picked", () => {
  it("never lets people with no device crowd out a batch", async () => {
    clock = Date.parse("2026-09-28T20:00:00Z");
    const feed = feedOf([
      { id: "1", title: "Project 2", due: "2026-09-30T03:59:00Z" },
    ]);
    // tadmin sorts first and has ELMS but no device; the batch is one.
    elms.serve(feed);
    const laptop = await signIn("tadmin", { now, env: testEnv, elms });
    await laptop.call("/api/todo/connect", { url: FEED_URL });
    await connected(feed);
    clock = Date.parse("2026-09-28T22:03:00Z");
    expect(
      await sendDueTomorrow(testEnv(), {
        now: now(),
        fetch: phone.fetch,
        batch: 1,
      }),
    ).toEqual({ due: 1, sent: 1, unsent: 0 });
    expect(phone.received.map((p) => p.title)).toEqual([
      "Project 2 is due tomorrow",
    ]);
  });

  it("wakes a paused feed when the reminder is turned back on", async () => {
    clock = Date.parse("2026-09-28T16:00:00Z");
    const device = await connected(
      feedOf([{ id: "1", title: "Project 2", due: "2026-09-30T03:59:00Z" }]),
    );
    await device.call("/api/notifications/settings/set", {
      settings: DEFAULT_NOTIFICATION_SETTINGS,
    });
    await env.DB.prepare("UPDATE todo_feeds SET status = 'paused'").run();
    await device.call("/api/notifications/settings/set", {
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: true } },
    });
    expect(
      await env.DB.prepare(
        "SELECT status, next_fetch_at FROM todo_feeds",
      ).first(),
    ).toEqual({ status: "active", next_fetch_at: now().toISOString() });
  });
});
