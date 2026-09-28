// Notifications end to end through the real router and D1 (V2.md §6): push
// subscriptions, settings, "Send me a test", `notify`, and pruning what the
// push service says is gone. The push service is faked: it decrypts each
// message with the device's own key, as a browser would.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
  verifyVapidJwt,
} from "~/core/push";
import type { MeResult, PushPayload } from "~/core/schema";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationsInboxResult,
  type PushDevicesResult,
} from "~/core/schema/notifications";
import { alertAdmins } from "../admin/alerts";
import { type ApiEnv, handleApi } from "../api/router";
import { type PurgeEnv, purgeDueAccounts } from "../auth/purge";
import { TEST_VAPID_KEYS } from "../push/config";
import { resetPushCachesForTests } from "../push/send";
import { MAX_PUSH_FAILURES } from "../push/store";
import { Device, FakeElms, signIn } from "../todo/testing";
import { pruneChatNotifications } from "./digest";
import { emailOffUrl } from "./email-off";
import { notify } from "./notify";
import { releaseHeldPushes } from "./quiet";
import { pruneDeliveries } from "./store";

let clock = Date.parse("2026-09-26T16:00:00.000Z");
const now = () => new Date(clock);

type Sent = { to: string; subject: string; text: string };

/** One browser's push subscription, with the private key to read what arrives. */
interface FakeSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  read: (body: Uint8Array) => Promise<PushPayload | null>;
}

async function aSubscription(n: number): Promise<FakeSubscription> {
  const pair = await generateKeyPair("ECDH", true);
  const uaPublic = await exportPublicKey(pair.publicKey);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`,
    keys: { p256dh: toBase64url(uaPublic), auth: toBase64url(authSecret) },
    read: async (body) => {
      const plain = await decryptPushPayload({
        body,
        uaPrivate: pair.privateKey,
        uaPublic,
        authSecret,
      });
      return plain
        ? (JSON.parse(new TextDecoder().decode(plain)) as PushPayload)
        : null;
    },
  };
}

interface Received {
  endpoint: string;
  headers: Headers;
  body: Uint8Array;
}

/** FCM, answering 201 unless an endpoint is told otherwise (the router's outbound fetch). */
class FakePushService extends FakeElms {
  received: Received[] = [];
  statuses = new Map<string, number>();
  networkDown = false;

  override readonly fetch: typeof fetch = async (input, init) => {
    if (this.networkDown) throw new TypeError("network down");
    const request = new Request(input, init);
    this.received.push({
      endpoint: request.url,
      headers: request.headers,
      body: new Uint8Array(await request.arrayBuffer()),
    });
    return new Response(null, {
      status: this.statuses.get(request.url) ?? 201,
    });
  };
}

let service: FakePushService;
let sent: Sent[];
let testEnv: ApiEnv;

function makeEnv(overrides: Record<string, unknown> = {}): ApiEnv {
  return {
    ...(env as unknown as ApiEnv),
    PUSH_ENABLED: "true",
    // The test pair stands in for production's var and secret here.
    VAPID_PUBLIC_KEY: TEST_VAPID_KEYS.publicKey,
    VAPID_PRIVATE_KEY: TEST_VAPID_KEYS.privateKey,
    VAPID_SUBJECT: "mailto:alerts@terpsicle.com",
    EMAIL: {
      send: async (message: Sent) => {
        sent.push(message);
        return { messageId: `msg-${sent.length}` };
      },
    } as unknown as SendEmail,
    ...overrides,
  } as ApiEnv;
}

beforeEach(async () => {
  clock = Date.parse("2026-09-26T16:00:00.000Z");
  service = new FakePushService();
  sent = [];
  testEnv = makeEnv();
  resetPushCachesForTests();
  await env.DB.batch(
    [
      "notification_deliveries",
      "notifications",
      "notification_settings",
      "push_subscriptions",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

const device = (userId = "tstudent") =>
  signIn(userId, { now, env: () => testEnv, elms: service });

const subscribe = (
  phone: Device,
  sub: FakeSubscription,
  label = "Mac · Chrome",
) =>
  phone.call("/api/push/subscribe", {
    endpoint: sub.endpoint,
    keys: sub.keys,
    label,
  });

const listDevices = (phone: Device, endpoint?: string) =>
  phone.call<PushDevicesResult>(
    "/api/push/devices",
    endpoint ? { endpoint } : {},
  );

const rows = () =>
  env.DB.prepare(
    "SELECT user_id, endpoint, failure_count, last_success_at FROM push_subscriptions ORDER BY endpoint",
  ).all<{
    user_id: string;
    endpoint: string;
    failure_count: number;
    last_success_at: string | null;
  }>();

describe("who may call push/* and notifications/*", () => {
  it("needs a session and the same origin", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    const body = { endpoint: sub.endpoint, keys: sub.keys };
    const stranger = new Device("", { now, env: () => testEnv, elms: service });
    expect((await stranger.request("/api/push/subscribe", body)).status).toBe(
      401,
    );
    const crossSite = await handleApi(
      new Request("https://terpsicle.com/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
          "Sec-Fetch-Site": "cross-site",
          Cookie: phone.cookie,
        },
      }),
      testEnv,
      { waitUntil: () => {} },
      now(),
    );
    expect(crossSite.status).toBe(403);
    expect((await rows()).results).toEqual([]);
  });

  it("refuses extra keys and keys of the wrong shape", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    for (const body of [
      { ...sub, read: undefined, extra: 1 },
      { endpoint: sub.endpoint, keys: { ...sub.keys, auth: "short" } },
      { endpoint: sub.endpoint, keys: { ...sub.keys, p256dh: "Bxyz" } },
    ])
      expect((await phone.request("/api/push/subscribe", body)).status).toBe(
        400,
      );
  });

  it("limits the test to 10 an hour per person", async () => {
    const phone = await device();
    for (let i = 0; i < 10; i++)
      expect((await phone.request("/api/push/test", {})).status).toBe(200);
    expect((await phone.request("/api/push/test", {})).status).toBe(429);
  });
});

describe("push/subscribe and the device list", () => {
  it("saves one row per device and lists it, marking this one", async () => {
    const phone = await device();
    const [a, b] = [await aSubscription(1), await aSubscription(2)];
    const first = now().toISOString();
    expect(await subscribe(phone, a, "iPhone · Safari")).toEqual({
      status: "ok",
    });
    clock += 60_000;
    await subscribe(phone, b);
    // Saving again (a new key, or pushsubscriptionchange) keeps one row,
    // and its date.
    await subscribe(phone, a, "iPhone · Safari");
    const { devices } = await listDevices(phone, a.endpoint);
    expect(devices.map((d) => [d.label, d.current, d.createdAt])).toEqual([
      ["iPhone · Safari", true, first],
      ["Mac · Chrome", false, now().toISOString()],
    ]);
    // The endpoint itself never leaves the server.
    expect(JSON.stringify(devices)).not.toContain("fcm.googleapis.com");
  });

  it("moves a device to whoever subscribes on it last", async () => {
    const mine = await device("tstudent");
    const theirs = await device("tclassmate");
    const sub = await aSubscription(1);
    await subscribe(mine, sub);
    await subscribe(theirs, sub);
    expect((await listDevices(mine)).devices).toEqual([]);
    expect((await listDevices(theirs)).devices).toHaveLength(1);
  });

  it("answers off while push is off, and unsupported for other hosts", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    testEnv = makeEnv({ PUSH_ENABLED: "false" });
    expect(await subscribe(phone, sub)).toEqual({ status: "off" });
    testEnv = makeEnv({ VAPID_PRIVATE_KEY: "" });
    expect(await subscribe(phone, sub)).toEqual({ status: "off" });
    testEnv = makeEnv();
    for (const endpoint of [
      "https://evil.example/push",
      "http://127.0.0.1:9999/push/1",
    ])
      expect(await subscribe(phone, { ...sub, endpoint })).toEqual({
        status: "unsupported",
      });
    expect((await rows()).results).toEqual([]);
  });

  it("forgets a device by endpoint or by id, only the person's own", async () => {
    const phone = await device();
    const other = await device("tclassmate");
    const [a, b] = [await aSubscription(1), await aSubscription(2)];
    await subscribe(phone, a);
    await subscribe(phone, b);
    const second = (await listDevices(phone, b.endpoint)).devices.find(
      (d) => d.current,
    );
    // Someone else can't remove it.
    await other.call("/api/push/remove", { id: second?.id });
    await other.call("/api/push/unsubscribe", { endpoint: a.endpoint });
    expect((await listDevices(phone)).devices).toHaveLength(2);
    await phone.call("/api/push/unsubscribe", { endpoint: a.endpoint });
    await phone.call("/api/push/remove", { id: second?.id });
    expect((await listDevices(phone)).devices).toEqual([]);
  });

  it("gives /api/me the public key while push works here", async () => {
    const phone = await device();
    const me = async () =>
      (await phone.call("/api/me")) as Extract<
        MeResult,
        { status: "signed-in" }
      >;
    expect(await me()).toMatchObject({
      flags: { push: true },
      pushPublicKey: TEST_VAPID_KEYS.publicKey,
    });
    testEnv = makeEnv({ PUSH_ENABLED: "false" });
    expect(await me()).toMatchObject({
      flags: { push: false },
      pushPublicKey: null,
    });
  });
});

describe("notifications/settings", () => {
  it("starts at the defaults, then keeps what's saved", async () => {
    const phone = await device();
    expect(await phone.call("/api/notifications/settings")).toEqual({
      settings: DEFAULT_NOTIFICATION_SETTINGS,
      todoConnected: false,
    });
    const settings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      seatOpen: { push: false, email: true },
    };
    await phone.call("/api/notifications/settings/set", { settings });
    expect(await phone.call("/api/notifications/settings")).toEqual({
      settings,
      todoConnected: false,
    });
    // Another person still has the defaults.
    const other = await device("tclassmate");
    expect(await other.call("/api/notifications/settings")).toEqual({
      settings: DEFAULT_NOTIFICATION_SETTINGS,
      todoConnected: false,
    });
    expect(
      (
        await phone.request("/api/notifications/settings/set", {
          settings: { ...settings, v: 2 },
        })
      ).status,
    ).toBe(400);
  });
});

describe("push/test", () => {
  it("encrypts for each device and signs for its push service", async () => {
    const phone = await device();
    expect(await phone.call("/api/push/test")).toEqual({
      status: "no-devices",
    });
    const sub = await aSubscription(1);
    await subscribe(phone, sub, "Mac · Chrome");
    expect(await phone.call("/api/push/test")).toEqual({
      status: "sent",
      devices: 1,
    });
    const [request] = service.received;
    if (!request) throw new Error("nothing sent");
    expect(request.endpoint).toBe(sub.endpoint);
    expect(request.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request.headers.get("TTL")).toBe("300");
    expect(request.headers.get("Urgency")).toBe("high");
    expect(request.headers.get("Topic")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const auth = request.headers.get("Authorization") ?? "";
    const [, jwt, key] = /^vapid t=([^,]+), k=(.+)$/.exec(auth) ?? [];
    expect(key).toBe(TEST_VAPID_KEYS.publicKey);
    expect(await verifyVapidJwt(jwt ?? "", key ?? "")).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: Math.floor(clock / 1000) + 12 * 3600,
      sub: "mailto:alerts@terpsicle.com",
    });
    expect(await sub.read(request.body)).toEqual({
      v: 1,
      type: "test",
      title: "Notifications are on",
      body: "This is how Terpsicle reaches you on Mac · Chrome.",
      url: "/settings/notifications",
      tag: "test",
    });
    // Tests aren't notifications: nothing to dedupe or count.
    const deliveries = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM notification_deliveries",
    ).first<{ n: number }>();
    expect(deliveries?.n).toBe(0);
    expect((await rows()).results[0]?.last_success_at).toBe(
      now().toISOString(),
    );
  });

  it("says failed when no push service takes it, and off while push is off", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    service.statuses.set(sub.endpoint, 503);
    expect(await phone.call("/api/push/test")).toEqual({ status: "failed" });
    testEnv = makeEnv({ PUSH_ENABLED: "false" });
    expect(await phone.call("/api/push/test")).toEqual({ status: "off" });
  });
});

describe("pruning", () => {
  it("drops 404 and 410 at once and counts other failures up to 10", async () => {
    const phone = await device();
    const subs = await Promise.all([1, 2, 3, 4].map(aSubscription));
    for (const sub of subs) await subscribe(phone, sub);
    const [gone, missing, flaky, fine] = subs as [
      FakeSubscription,
      FakeSubscription,
      FakeSubscription,
      FakeSubscription,
    ];
    service.statuses.set(gone.endpoint, 410);
    service.statuses.set(missing.endpoint, 404);
    service.statuses.set(flaky.endpoint, 429);
    await phone.call("/api/push/test");
    expect(
      (await rows()).results.map((r) => [r.endpoint, r.failure_count]),
    ).toEqual([
      [flaky.endpoint, 1],
      [fine.endpoint, 0],
    ]);
    // Nine more failures in a row and it goes; one success in between resets.
    service.statuses.set(flaky.endpoint, 201);
    await phone.call("/api/push/test");
    expect((await rows()).results[0]?.failure_count).toBe(0);
    service.statuses.set(flaky.endpoint, 500);
    for (let i = 0; i < MAX_PUSH_FAILURES - 1; i++) {
      clock += 3_600_000; // past the route's hourly limit
      await phone.call("/api/push/test");
    }
    expect((await rows()).results.map((r) => r.endpoint)).toEqual([
      flaky.endpoint,
      fine.endpoint,
    ]);
    clock += 3_600_000;
    await phone.call("/api/push/test");
    expect((await rows()).results.map((r) => r.endpoint)).toEqual([
      fine.endpoint,
    ]);
  });

  it("treats a network error as a failure, never a throw", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    service.networkDown = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await phone.call("/api/push/test")).toEqual({ status: "failed" });
    // The log names the error, never the endpoint.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("fcm.googleapis");
    warn.mockRestore();
    expect((await rows()).results[0]?.failure_count).toBe(1);
  });
});

const seatOpen = (
  key = "seat-open:tstudent:202608:CMSC351-0101:t1",
  section = "CMSC351 0101",
) => ({
  type: "seat-open" as const,
  key,
  inbox: [
    {
      id: key,
      groupKey: "seat:202608",
      title: `A seat opened in ${section}`,
      body: "1 of 40 open. Register on Testudo before it's gone.",
      label: section,
      url: "/schedule/course/CMSC351?term=202608",
      termId: "202608",
      courseCode: section.slice(0, 7),
    },
  ],
  push: {
    event: {
      type: "seat-open" as const,
      title: `A seat opened in ${section}`,
      body: "1 of 40 open. Register on Testudo before it's gone.",
    },
    url: "/schedule/course/CMSC351?term=202608",
  },
  email: {
    to: "tstudent@terpmail.umd.edu",
    subject: "A seat opened in CMSC351 0101",
    text: "…",
    html: "<p>…</p>",
    headers: {},
  },
});

describe("notify", () => {
  const options = () => ({ now: now(), fetch: service.fetch });

  const deliveries = () =>
    env.DB.prepare(
      "SELECT user_id, type, channel, dedupe_key, status, provider_id FROM notification_deliveries ORDER BY dedupe_key DESC",
    ).all();

  it("pushes to every device and emails, once per event", async () => {
    const phone = await device();
    const [a, b] = [await aSubscription(1), await aSubscription(2)];
    await subscribe(phone, a);
    await subscribe(phone, b);
    expect(await notify(testEnv, "tstudent", seatOpen(), options())).toEqual({
      inbox: "new",
      push: "sent",
      email: "sent",
    });
    expect(service.received.map((r) => r.endpoint).sort()).toEqual([
      a.endpoint,
      b.endpoint,
    ]);
    const request = service.received.find((r) => r.endpoint === a.endpoint);
    expect(request?.headers.get("TTL")).toBe("3600");
    expect(request?.headers.get("Urgency")).toBe("high");
    expect(await a.read(request?.body ?? new Uint8Array())).toEqual({
      v: 1,
      type: "seat-open",
      title: "A seat opened in CMSC351 0101",
      body: "1 of 40 open. Register on Testudo before it's gone.",
      url: "/schedule/course/CMSC351?term=202608",
      tag: "seat:202608",
      count: 1,
      badge: 1,
      renotify: true,
      id: "seat-open:tstudent:202608:CMSC351-0101:t1",
    });
    expect(sent.map((m) => m.to)).toEqual(["tstudent@terpmail.umd.edu"]);

    // A retried run: nothing goes twice.
    expect(await notify(testEnv, "tstudent", seatOpen(), options())).toEqual({
      inbox: "duplicate",
      push: "duplicate",
      email: "duplicate",
    });
    expect(service.received).toHaveLength(2);
    expect(sent).toHaveLength(1);
    expect((await deliveries()).results).toEqual([
      expect.objectContaining({
        user_id: "tstudent",
        type: "seat-open",
        channel: "push",
        dedupe_key: "seat-open:tstudent:202608:CMSC351-0101:t1:push",
        status: "sent",
        provider_id: "201,201",
      }),
      expect.objectContaining({
        channel: "email",
        dedupe_key: "seat-open:tstudent:202608:CMSC351-0101:t1:email",
        status: "sent",
        provider_id: "msg-1",
      }),
    ]);
  });

  it("follows the person's settings", async () => {
    const phone = await device();
    await subscribe(phone, await aSubscription(1));
    await phone.call("/api/notifications/settings/set", {
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatOpen: { push: false, email: false },
      },
    });
    // Off for push and email, it still lands in the inbox.
    expect(await notify(testEnv, "tstudent", seatOpen(), options())).toEqual({
      inbox: "new",
      push: "off",
      email: "off",
    });
    // Off by default until ELMS is connected (V3 §4).
    const due = {
      title: "Project 2 is due tomorrow",
      body: "CMSC216 · 11:59pm",
      url: "/todo?day=2026-09-28",
    };
    expect(
      await notify(
        testEnv,
        "tstudent",
        {
          type: "todo-due",
          key: "todo-due:tstudent:2026-09-27",
          inbox: [
            {
              id: "todo-due:tstudent:2026-09-27",
              groupKey: "todo-due:2026-09-28",
              ...due,
            },
          ],
          push: {
            event: { type: "todo-due", title: due.title, body: due.body },
            url: due.url,
          },
        },
        options(),
      ),
    ).toEqual({ inbox: "new", push: "off", email: "none" });
    expect(service.received).toEqual([]);
    expect(sent).toEqual([]);
    expect((await deliveries()).results).toEqual([]);
    expect(
      (await phone.call<NotificationsInboxResult>("/api/notifications/inbox"))
        .unread,
    ).toBe(2);
  });

  it("with no devices, emails only; with push off here, records the push as skipped", async () => {
    await device();
    expect(
      await notify(testEnv, "tstudent", seatOpen("k1"), options()),
    ).toEqual({ inbox: "new", push: "none", email: "sent" });
    const phone = await device();
    await subscribe(phone, await aSubscription(1));
    testEnv = makeEnv({ PUSH_ENABLED: "false", EMAIL: undefined });
    expect(
      await notify(testEnv, "tstudent", seatOpen("k2"), options()),
    ).toEqual({ inbox: "new", push: "skipped", email: "skipped" });
    expect(service.received).toEqual([]);
    expect(
      (await deliveries()).results.map((d) => [
        (d as { dedupe_key: string }).dedupe_key,
        (d as { status: string }).status,
      ]),
    ).toEqual([
      ["k2:push", "skipped"],
      ["k2:email", "skipped"],
      ["k1:email", "sent"],
    ]);
  });

  it("records a push every device refused as failed, and prunes the gone ones", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    service.statuses.set(sub.endpoint, 410);
    expect(
      (await notify(testEnv, "tstudent", seatOpen(), options())).push,
    ).toBe("failed");
    expect((await rows()).results).toEqual([]);
    expect((await deliveries()).results[0]).toMatchObject({
      channel: "push",
      status: "failed",
      provider_id: "410",
    });
  });
});

describe("signing out, deleting the account and the purge", () => {
  it("stops this device on sign-out, and every device on deletion", async () => {
    const phone = await device();
    const laptop = await device();
    const [a, b, c] = await Promise.all([1, 2, 3].map(aSubscription));
    for (const sub of [a, b, c])
      await subscribe(phone, sub as FakeSubscription);
    const out = await laptop.request("/api/auth/sign-out", {
      pushEndpoint: a?.endpoint,
    });
    expect(out.status).toBe(200);
    expect((await rows()).results).toHaveLength(2);
    expect((await phone.request("/api/account/delete", {})).status).toBe(200);
    expect((await rows()).results).toEqual([]);
  });

  it("purges settings and devices, keeping deliveries without the person", async () => {
    const phone = await device();
    await subscribe(phone, await aSubscription(1));
    await phone.call("/api/notifications/settings/set", {
      settings: DEFAULT_NOTIFICATION_SETTINGS,
    });
    await notify(testEnv, "tstudent", seatOpen(), {
      now: now(),
      fetch: service.fetch,
    });
    await env.DB.prepare(
      "UPDATE users SET status = 'deleting', delete_after = ?1",
    )
      .bind(now().toISOString())
      .run();
    await purgeDueAccounts(env as unknown as PurgeEnv, now());
    const count = (table: string) =>
      env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{
        n: number;
      }>();
    expect((await count("push_subscriptions"))?.n).toBe(0);
    expect((await count("notification_settings"))?.n).toBe(0);
    expect(
      (
        await env.DB.prepare(
          "SELECT DISTINCT user_id FROM notification_deliveries",
        ).all()
      ).results,
    ).toEqual([{ user_id: null }]);
  });

  it("prunes deliveries after 90 days", async () => {
    await device();
    await notify(testEnv, "tstudent", seatOpen(), {
      now: now(),
      fetch: service.fetch,
    });
    clock += 89 * 86_400_000;
    expect(await pruneDeliveries(env.DB, now())).toBe(0);
    clock += 2 * 86_400_000;
    expect(await pruneDeliveries(env.DB, now())).toBe(1);
  });
});

describe("notifications/email-off", () => {
  const oneClick = (url: string, method = "POST") =>
    handleApi(
      new Request(url, {
        method,
        body: method === "POST" ? "List-Unsubscribe=One-Click" : null,
        headers:
          method === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {},
      }),
      testEnv,
      { waitUntil: () => {} },
    );

  it("turns off that type's email for that person, and only with a good key", async () => {
    const phone = await device();
    await phone.call("/api/notifications/settings/set", {
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        chatDigest: { email: true },
      },
    });
    const url = await emailOffUrl(
      env.DATA,
      "https://terpsicle.com",
      "tstudent",
      "chat-digest",
    );
    const forged = url.replace("u=tstudent", "u=tclassmate");
    expect((await oneClick(forged)).status).toBe(400);
    // A GET (a link scanner, or a person) changes nothing.
    const get = await oneClick(url, "GET");
    expect(get.status).toBe(303);
    expect(get.headers.get("Location")).toBe(
      "https://terpsicle.com/settings/notifications",
    );
    const settings = () =>
      phone.call<{ settings: typeof DEFAULT_NOTIFICATION_SETTINGS }>(
        "/api/notifications/settings",
        {},
      );
    expect((await settings()).settings.chatDigest.email).toBe(true);
    const post = await oneClick(url);
    expect(post.status).toBe(200);
    expect((await settings()).settings).toEqual({
      ...DEFAULT_NOTIFICATION_SETTINGS,
      chatDigest: { email: false },
    });
  });
});

describe("the inbox (V2.md §6.7)", () => {
  const options = () => ({ now: now(), fetch: service.fetch });
  const inbox = (phone: Device, before?: string) =>
    phone.call<NotificationsInboxResult>(
      "/api/notifications/inbox",
      before ? { before } : {},
    );
  const read = (phone: Device, body: object) =>
    phone.call<{ unread: number }>("/api/notifications/read", body);
  const unread = async (phone: Device) =>
    (await phone.call<{ unread: number }>("/api/notifications/unread")).unread;
  const minutes = (n: number) => {
    clock += n * 60_000;
  };
  const dueOn = (day: string, n = 1) => ({
    type: "todo-due" as const,
    key: `todo-due:tstudent:${day}`,
    inbox: [
      {
        id: `todo-due:tstudent:${day}`,
        groupKey: `todo-due:${day}`,
        count: n,
        title: `${n} things due tomorrow`,
        body: "Project 2 and more",
        url: `/todo?day=${day}`,
      },
    ],
  });

  it("groups a term's seat openings into one push and one item, with the count", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k1", "CMSC351 0101"),
      options(),
    );
    minutes(5);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k2", "MATH240 0203"),
      options(),
    );
    const payloads = await Promise.all(
      service.received.map((r) => sub.read(r.body)),
    );
    expect(payloads.map((p) => [p?.tag, p?.count, p?.badge, p?.title])).toEqual(
      [
        ["seat:202608", 1, 1, "A seat opened in CMSC351 0101"],
        ["seat:202608", 2, 1, "Seats opened in 2 sections you're watching"],
      ],
    );
    expect(payloads[1]).toMatchObject({
      body: "MATH240 0203 and CMSC351 0101",
      renotify: true,
      id: "k2",
    });
    expect(await inbox(phone)).toEqual({
      items: [
        {
          id: "k2",
          type: "seat-open",
          product: "schedule",
          title: "Seats opened in 2 sections you're watching",
          body: "MATH240 0203 and CMSC351 0101",
          url: "/schedule/course/CMSC351?term=202608",
          count: 2,
          createdAt: now().toISOString(),
          readAt: null,
        },
      ],
      unread: 1,
      next: null,
    });
  });

  it("never buzzes again for Due tomorrow, and says so in the push", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    await phone.call("/api/notifications/settings/set", {
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: true } },
    });
    const due = dueOn("2026-09-27", 3);
    await notify(
      testEnv,
      "tstudent",
      {
        ...due,
        push: {
          event: {
            type: "todo-due",
            title: "3 things due tomorrow",
            body: "Project 2 and more",
          },
          url: "/todo?day=2026-09-27",
        },
      },
      options(),
    );
    const [request] = service.received;
    expect(await sub.read(request?.body ?? new Uint8Array())).toMatchObject({
      tag: "todo-due:2026-09-27",
      title: "3 things due tomorrow",
      count: 3,
      renotify: false,
    });
  });

  it("reads by id, by course, by day or all, and keeps what was read together as one item", async () => {
    const phone = await device();
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k1", "CMSC351 0101"),
      options(),
    );
    minutes(1);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k2", "MATH240 0203"),
      options(),
    );
    minutes(1);
    await notify(testEnv, "tstudent", dueOn("2026-09-27"), options());
    expect(await unread(phone)).toBe(2);

    // Opening CMSC351 in Schedule reads its seat opening, not MATH240's.
    minutes(1);
    expect(
      await read(phone, {
        course: { termId: "202608", courseCode: "CMSC351" },
      }),
    ).toEqual({ unread: 2 });
    const afterCourse = (await inbox(phone)).items;
    expect(afterCourse.map((i) => [i.id, i.count, i.readAt !== null])).toEqual([
      ["todo-due:tstudent:2026-09-27", 1, false],
      ["k2", 1, false],
      ["k1", 1, true],
    ]);
    expect(afterCourse[1]?.title).toBe("A seat opened in MATH240 0203");

    // Todo's day reads its "Due tomorrow"; an id reads its item.
    expect(await read(phone, { day: "2026-09-27" })).toEqual({ unread: 1 });
    expect(await read(phone, { ids: ["k2"] })).toEqual({ unread: 0 });

    // Everything at once, then someone else's ids read nothing of mine.
    minutes(1);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k3", "ENGL101 0401"),
      options(),
    );
    minutes(1);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k4", "CMSC351 0101"),
      options(),
    );
    const classmate = await device("tclassmate");
    expect(await read(classmate, { ids: ["k4"] })).toEqual({ unread: 0 });
    expect(await unread(phone)).toBe(1);
    expect(await read(phone, { all: true })).toEqual({ unread: 0 });
    // Read together, the two stay one item.
    const [latest] = (await inbox(phone)).items;
    expect(latest).toMatchObject({
      id: "k4",
      count: 2,
      title: "Seats opened in 2 sections you're watching",
      readAt: now().toISOString(),
    });
  });

  it("reads an item up to its newest row, not one that came after", async () => {
    const phone = await device();
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k1", "CMSC351 0101"),
      options(),
    );
    minutes(1);
    await notify(
      testEnv,
      "tstudent",
      seatOpen("k2", "MATH240 0203"),
      options(),
    );
    expect(await read(phone, { ids: ["k1"] })).toEqual({ unread: 1 });
    const [newest] = (await inbox(phone)).items;
    expect(newest).toMatchObject({ id: "k2", count: 1, readAt: null });
  });

  it("pages newest first, 30 at a time", async () => {
    const phone = await device();
    for (let day = 1; day <= 31; day++) {
      minutes(1);
      await notify(
        testEnv,
        "tstudent",
        dueOn(`2026-10-${String(day).padStart(2, "0")}`),
        options(),
      );
    }
    const first = await inbox(phone);
    expect(first.items).toHaveLength(30);
    expect(first.items[0]?.url).toBe("/todo?day=2026-10-31");
    expect(first.unread).toBe(31);
    expect(first.next).not.toBeNull();
    const second = await inbox(phone, first.next ?? undefined);
    expect(second.items.map((i) => i.url)).toEqual(["/todo?day=2026-10-01"]);
    expect(second.next).toBeNull();
  });

  it("refuses an empty read and a malformed one", async () => {
    const phone = await device();
    expect((await phone.request("/api/notifications/read", {})).status).toBe(
      400,
    );
    expect(
      (await phone.request("/api/notifications/read", { ids: [] })).status,
    ).toBe(400);
    expect(
      (await phone.request("/api/notifications/read", { day: "tomorrow" }))
        .status,
    ).toBe(400);
  });
});

describe("chat notifications", () => {
  it("prunes mentions and replies after 30 days", async () => {
    await device();
    const at = (days: number) =>
      new Date(clock - days * 86_400_000).toISOString();
    await env.DB.batch(
      [29, 31].map((days) =>
        env.DB.prepare(
          `INSERT INTO notifications (id, user_id, type, product, group_key, term_id, course_code, room_id, seq, message_id, actor_id, created_at)
           VALUES (?1, 'tstudent', 'chat-mention', 'chat', 'chat-mention:202701:CMSC131', '202701', 'CMSC131', '202701:CMSC131', 1, ?1, 'tclassmate', ?2)`,
        ).bind(`n${days}`, at(days)),
      ),
    );
    expect(await pruneChatNotifications(env.DB, now())).toBe(1);
    const { results } = await env.DB.prepare(
      "SELECT id FROM notifications",
    ).all();
    expect(results).toEqual([{ id: "n29" }]);
  });
});

describe("owner alerts (V2.md §6.7, §9.4)", () => {
  const options = () => ({ now: now(), fetch: service.fetch });
  const minutes = (n: number) => {
    clock += n * 60_000;
  };
  const SPAM = [{ code: "spam", source: "cross-room", action: "hold" }];
  const queue = (
    id: string,
    over: {
      course?: string | null;
      labels?: object[];
      urgent?: boolean;
      status?: "open" | "retry" | "closed";
      surface?: "chat" | "review";
    } = {},
  ) =>
    env.DB.prepare(
      `INSERT INTO moderation_queue (id, surface, ref, snapshot, labels, urgent, status, created_at)
       VALUES (?1, ?2, ?1, ?3, ?4, ?5, ?6, ?7)`,
    )
      .bind(
        id,
        over.surface ?? "chat",
        JSON.stringify({
          text: "buy answers at example dot com",
          course: over.course === undefined ? "CMSC351" : over.course,
          activeAssignments: false,
          scores: {},
          retries: 0,
        }),
        JSON.stringify(over.labels ?? SPAM),
        over.urgent === false ? 0 : 1,
        over.status ?? "open",
        now().toISOString(),
      )
      .run();
  const adminRows = () =>
    env.DB.prepare(
      "SELECT id, user_id, product, group_key, label, url FROM notifications WHERE type = 'admin-urgent' ORDER BY id",
    ).all();

  beforeEach(async () => {
    testEnv = makeEnv({ AUTH_TEST_MODE: "true" });
    await env.DB.prepare("DELETE FROM moderation_queue").run();
  });

  it("pushes and emails each admin, grouped, never the text or the author", async () => {
    const admin = await device("tadmin");
    const sub = await aSubscription(1);
    await subscribe(admin, sub);
    await device("tstudent");
    await queue("q1", { course: "CMSC351" });
    await queue("q2", { course: "CMSC131" });
    // Not in front of the owner, or not urgent: no alert.
    await queue("q3", { course: "MATH140", status: "retry" });
    await queue("q4", {
      course: "MATH140",
      urgent: false,
      labels: [{ code: "insult", source: "rules", action: "hold" }],
    });
    // 3am: an urgent item comes through quiet hours.
    clock = Date.parse("2026-09-27T03:00:00-04:00");
    expect(await alertAdmins(testEnv, options())).toEqual({
      alerted: 1,
      items: 2,
    });
    const [payload] = await Promise.all(
      service.received.map((r) => sub.read(r.body)),
    );
    expect(payload).toMatchObject({
      type: "admin-urgent",
      title: "Held for you: spam in 2 courses",
      body: "CMSC131 and CMSC351. Open the queue to decide.",
      url: "/admin",
      tag: "admin-urgent",
      count: 2,
      renotify: true,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "tadmin@terpmail.umd.edu",
      subject: "Held for you: spam in 2 courses",
    });
    expect(sent[0]?.text).not.toContain("example dot com");
    expect(JSON.stringify(payload)).not.toContain("example dot com");
    expect((await adminRows()).results).toEqual([
      {
        id: "admin-urgent:tadmin:q1",
        user_id: "tadmin",
        product: "admin",
        group_key: "admin-urgent",
        label: "spam|chat|CMSC351",
        url: "/admin",
      },
      expect.objectContaining({ id: "admin-urgent:tadmin:q2" }),
    ]);
    // The next run: nothing new, nothing sent.
    minutes(5);
    expect(await alertAdmins(testEnv, options())).toEqual({
      alerted: 0,
      items: 0,
    });
  });

  it("alerts at most once an hour; what's held in between comes grouped", async () => {
    const admin = await device("tadmin");
    const sub = await aSubscription(1);
    await subscribe(admin, sub);
    await queue("q1", { course: "CMSC351" });
    expect((await alertAdmins(testEnv, options())).alerted).toBe(1);
    minutes(10);
    await queue("q2", {
      course: "CMSC131",
      labels: [{ code: "violence", source: "guard", action: "hold" }],
    });
    minutes(20);
    expect((await alertAdmins(testEnv, options())).alerted).toBe(0);
    // Decided before the hour was up: never alerts.
    await queue("q3", { course: "MATH140", status: "closed" });
    minutes(30);
    expect(await alertAdmins(testEnv, options())).toEqual({
      alerted: 1,
      items: 1,
    });
    const payloads = await Promise.all(
      service.received.map((r) => sub.read(r.body)),
    );
    // The push stands for the unread group; the email for what's new.
    expect(payloads.map((p) => [p?.title, p?.count])).toEqual([
      ["Held for you: spam in CMSC351", 1],
      ["Held for you: 2 urgent items", 2],
    ]);
    expect(payloads[1]?.body).toBe("Violence in CMSC131 and spam in CMSC351.");
    expect(sent.map((m) => m.subject)).toEqual([
      "Held for you: spam in CMSC351",
      "Held for you: violence in CMSC131",
    ]);
  });

  it("alerts no one who isn't an admin", async () => {
    await subscribe(await device("tstudent"), await aSubscription(1));
    await queue("q1");
    // Outside test mode the fixture admin isn't one, and nobody's signed in
    // from config/admins.txt here.
    testEnv = makeEnv({ AUTH_TEST_MODE: "false" });
    await device("tadmin");
    expect(await alertAdmins(testEnv, options())).toEqual({
      alerted: 0,
      items: 0,
    });
    expect(service.received).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});

describe("quiet hours (V2.md §6.7)", () => {
  const options = () => ({ now: now(), fetch: service.fetch });
  /** A time in College Park on 2026-09-27 (UTC-4). */
  const at = (hhmm: string) => {
    clock = Date.parse(`2026-09-27T${hhmm}:00-04:00`);
  };
  const settle = (phone: Device, over: object) =>
    phone.call("/api/notifications/settings/set", {
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...over },
    });
  const due = (day: string) => ({
    type: "todo-due" as const,
    key: `todo-due:tstudent:${day}`,
    inbox: [
      {
        id: `todo-due:tstudent:${day}`,
        groupKey: `todo-due:${day}`,
        title: "Project 2 is due tomorrow",
        body: "CMSC216",
        url: `/todo?day=${day}`,
      },
    ],
    push: {
      event: {
        type: "todo-due" as const,
        title: "Project 2 is due tomorrow",
        body: "CMSC216",
      },
      url: `/todo?day=${day}`,
    },
  });
  const seatOnly = (key?: string, section?: string) => {
    const { email: _email, ...rest } = seatOpen(key, section);
    return rest;
  };
  const held = () =>
    env.DB.prepare(
      "SELECT id FROM notifications WHERE push_held_at IS NOT NULL ORDER BY id",
    ).all<{ id: string }>();

  it("holds pushes at night and sends each group once at 8am", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    await settle(phone, { seatThroughQuiet: false });
    at("02:00");
    expect(
      await notify(
        testEnv,
        "tstudent",
        seatOnly("k1", "CMSC351 0101"),
        options(),
      ),
    ).toEqual({ inbox: "new", push: "held", email: "none" });
    at("03:30");
    await notify(
      testEnv,
      "tstudent",
      seatOnly("k2", "MATH240 0203"),
      options(),
    );
    expect(service.received).toHaveLength(0);
    expect((await held()).results).toEqual([{ id: "k1" }, { id: "k2" }]);
    // The inbox has them at once, pushed or not.
    expect(
      (
        await phone.call<NotificationsInboxResult>(
          "/api/notifications/inbox",
          {},
        )
      ).unread,
    ).toBe(1);

    at("07:55");
    expect(await releaseHeldPushes(testEnv, options())).toEqual({
      groups: 0,
      sent: 0,
    });
    at("08:00");
    expect(await releaseHeldPushes(testEnv, options())).toEqual({
      groups: 1,
      sent: 1,
    });
    const payloads = await Promise.all(
      service.received.map((r) => sub.read(r.body)),
    );
    expect(payloads).toEqual([
      {
        v: 1,
        type: "seat-open",
        title: "Seats opened in 2 sections you're watching",
        body: "MATH240 0203 and CMSC351 0101",
        url: "/schedule/course/CMSC351?term=202608",
        tag: "seat:202608",
        count: 2,
        badge: 1,
        renotify: false,
        id: "k2",
      },
    ]);
    expect((await held()).results).toEqual([]);
    // The next run finds nothing waiting.
    at("08:05");
    expect(await releaseHeldPushes(testEnv, options())).toEqual({
      groups: 0,
      sent: 0,
    });
    expect(service.received).toHaveLength(1);
  });

  it("sends nothing at 8am for a group read in the night, or a type turned off since", async () => {
    const phone = await device();
    await subscribe(phone, await aSubscription(1));
    await settle(phone, { seatThroughQuiet: false, todoDue: { push: true } });
    at("23:30");
    expect(
      (await notify(testEnv, "tstudent", due("2026-09-28"), options())).push,
    ).toBe("held");
    expect(
      (await notify(testEnv, "tstudent", seatOnly(), options())).push,
    ).toBe("held");
    await phone.call("/api/notifications/read", {
      course: { termId: "202608", courseCode: "CMSC351" },
    });
    await settle(phone, { seatThroughQuiet: false, todoDue: { push: false } });
    clock = Date.parse("2026-09-28T08:10:00-04:00");
    // The seats group was read: taken, nothing sent. Due tomorrow's push
    // is off now: taken, nothing sent.
    expect(await releaseHeldPushes(testEnv, options())).toEqual({
      groups: 1,
      sent: 0,
    });
    expect(service.received).toHaveLength(0);
    expect((await held()).results).toEqual([]);
  });

  it("lets seat openings through by default, and sends at once with quiet hours off", async () => {
    const phone = await device();
    await subscribe(phone, await aSubscription(1));
    await settle(phone, { todoDue: { push: true } });
    at("01:00");
    expect(
      (await notify(testEnv, "tstudent", seatOnly(), options())).push,
    ).toBe("sent");
    expect(
      (await notify(testEnv, "tstudent", due("2026-09-27"), options())).push,
    ).toBe("held");
    await settle(phone, { todoDue: { push: true }, quietHours: { on: false } });
    expect(
      (await notify(testEnv, "tstudent", due("2026-09-28"), options())).push,
    ).toBe("sent");
    expect(service.received).toHaveLength(2);
  });

  it("keeps who and what off the lock screen with showText off", async () => {
    const phone = await device();
    const sub = await aSubscription(1);
    await subscribe(phone, sub);
    await settle(phone, { showText: false });
    const mention = {
      type: "chat-mention" as const,
      key: "chat-mention:tstudent:m1",
      inbox: [
        {
          id: "chat:tstudent:m1",
          groupKey: "chat-mention:202701:CMSC131",
          termId: "202701",
          courseCode: "CMSC131",
          chat: {
            roomId: "202701:CMSC131",
            threadId: null,
            seq: 1,
            messageId: "m1",
            actorId: "tclassmate",
          },
        },
      ],
      push: {
        event: {
          type: "chat-mention" as const,
          actor: "Test Classmate",
          place: "CMSC131",
          text: "@Test Student are you in the 2pm lab?",
        },
        url: "/chat?term=202701&course=CMSC131",
      },
    };
    expect((await notify(testEnv, "tstudent", mention, options())).push).toBe(
      "sent",
    );
    const [request] = service.received;
    expect(await sub.read(request?.body ?? new Uint8Array())).toMatchObject({
      title: "New mention in CMSC131",
      body: "",
    });
  });
});
