// Seat watches end to end through the real router, D1 and R2 (BUILD.md §5):
// watch, list and stop as a signed-in person; the seats cron's email when a
// watched section reopens, with its dedupe, cooldown and daily cap; the
// emails' one-click stop; and the daily job ending past terms' watches.
// Email goes to a mock EMAIL binding.
import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findTestUser } from "~/core/auth";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
} from "~/core/push";
import {
  SEAT_WATCH_MAX_PER_USER,
  type SeatsFile,
  SeatUnwatchResultSchema,
  SeatWatchListResultSchema,
  SeatWatchResultSchema,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import { DEFAULT_NOTIFICATION_SETTINGS } from "~/core/schema/notifications";
import {
  archivedFixtureTermId,
  buildMockDataFiles,
  fixtureTermId,
  mockSeats,
} from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { upsertUser } from "../auth/store";
import { writeSettings } from "../notifications/store";
import { TEST_VAPID_KEYS } from "../push/config";
import { saveSubscription } from "../push/store";
import { notifySeatChanges } from "./notify";
import { endPastTermWatches, oneClickStopUrl } from "./service";

const ORIGIN = "https://terpsicle.com";
const SECTION = "CMSC351-0101"; // Full in the mock seats: [0, 120, 14, null].
const OTHER = "AAAS100-0101"; // Full too.

type Sent = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

function makeEnv(overrides: Partial<ApiEnv> = {}) {
  const sent: Sent[] = [];
  const binding = {
    send: vi.fn(async (message: Sent) => {
      sent.push(message);
      return { messageId: `msg-${sent.length}` };
    }),
  };
  const testEnv: ApiEnv = {
    ...env,
    SEAT_ALERTS_ENABLED: "true",
    EMAIL: binding as unknown as SendEmail,
    ...overrides,
  };
  return { testEnv, sent };
}

let clock = Date.parse("2026-10-01T15:00:00.000Z");
const now = () => new Date(clock);
const tick = (minutes: number) => {
  clock += minutes * 60_000;
};

beforeAll(async () => {
  // The mock catalog, exactly as the jobs would publish it.
  for (const [key, bytes] of await buildMockDataFiles())
    if (key.startsWith("catalog/")) await env.DATA.put(key, bytes);
});

beforeEach(async () => {
  clock = Date.parse("2026-10-01T15:00:00.000Z");
  await env.DB.batch(
    [
      "seat_watches",
      "seat_alert_sends",
      "notification_deliveries",
      "notification_settings",
      "push_subscriptions",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

/** A signed-in browser for one of TEST_USERS. */
async function signIn(userId: string, testEnv: ApiEnv) {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, now());
  const cookie = (await startSession(env.DB, userId, now())).split(";")[0];
  const request = (path: string, body: unknown, headers = {}) =>
    handleApi(
      new Request(`${ORIGIN}/api/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: cookie ?? "",
          ...headers,
        },
      }),
      testEnv,
      { waitUntil: () => {} },
      now(),
    );
  return {
    request,
    watch: async (sectionKey: string, termId = fixtureTermId) =>
      SeatWatchResultSchema.parse(
        await (await request("alerts/watch", { termId, sectionKey })).json(),
      ),
    unwatch: async (sectionKey: string, termId = fixtureTermId) =>
      SeatUnwatchResultSchema.parse(
        await (await request("alerts/unwatch", { termId, sectionKey })).json(),
      ),
    list: async (input: { termId?: string } = {}) =>
      SeatWatchListResultSchema.parse(
        await (await request("alerts/list", input)).json(),
      ),
  };
}

/** A seats run where `sectionKey` goes from full to `open` seats. */
function reopen(sectionKey: string, open: number, asOf: string): SeatsFile {
  const total = mockSeats.seats[sectionKey]?.[1] ?? open;
  return {
    ...mockSeats,
    asOf,
    seats: { ...mockSeats.seats, [sectionKey]: [open, total, 0, null] },
  };
}

const run = (testEnv: ApiEnv, before: SeatsFile, after: SeatsFile) =>
  notifySeatChanges(testEnv, before, after, { now: now() });

describe("seat watches", () => {
  it("watch → list → reopen emails once → stop, all as the signed-in person", async () => {
    const { testEnv, sent } = makeEnv();
    const student = await signIn("tstudent", testEnv);

    const on = await student.watch(SECTION);
    expect(on).toMatchObject({
      status: "watching",
      watch: {
        termId: fixtureTermId,
        sectionKey: SECTION,
        lastNotifiedAt: null,
      },
    });
    // Idempotent: the same watch back.
    expect(await student.watch(SECTION)).toEqual(on);
    expect(await student.list()).toEqual({
      status: "ok",
      watches: [on.status === "watching" ? on.watch : null],
    });

    // The section reopens: one email, to the account's address.
    const after = reopen(SECTION, 3, "2026-10-01T15:05:00.000Z");
    expect(await run(testEnv, mockSeats, after)).toEqual({
      checked: 1,
      sent: 1,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("tstudent@terpmail.umd.edu");
    expect(sent[0]?.subject).toBe("3 seats opened in CMSC351 0101");
    expect(sent[0]?.text).toContain(`${ORIGIN}/settings#watching`);
    expect(sent[0]?.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    // A retried cron run with the same snapshot sends nothing more.
    expect(await run(testEnv, mockSeats, after)).toMatchObject({ sent: 0 });
    const listed = await student.list();
    expect(listed.status === "ok" && listed.watches[0]?.lastNotifiedAt).toBe(
      now().toISOString(),
    );

    expect(await student.unwatch(SECTION)).toEqual({ status: "stopped" });
    expect(await student.unwatch(SECTION)).toEqual({ status: "stopped" });
    expect(await student.list()).toEqual({ status: "ok", watches: [] });
    tick(60);
    expect(
      await run(testEnv, mockSeats, reopen(SECTION, 5, now().toISOString())),
    ).toEqual({ checked: 0, sent: 0 });
  });

  it("keeps each person's watches their own", async () => {
    const { testEnv, sent } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    const classmate = await signIn("tclassmate", testEnv);
    await student.watch(SECTION);
    await classmate.watch(OTHER);
    const mine = await student.list();
    expect(
      mine.status === "ok" && mine.watches.map((w) => w.sectionKey),
    ).toEqual([SECTION]);
    // Stopping someone else's section changes nothing for them.
    await student.unwatch(OTHER);
    const theirs = await classmate.list();
    expect(theirs.status === "ok" && theirs.watches).toHaveLength(1);

    await run(testEnv, mockSeats, reopen(OTHER, 1, now().toISOString()));
    expect(sent.map((m) => m.to)).toEqual(["tclassmate@terpmail.umd.edu"]);
  });

  it("only emails when a full section reopens, with a cooldown and a daily cap", async () => {
    const { testEnv, sent } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    await student.watch(SECTION);

    // Open to open: nothing.
    const open3 = reopen(SECTION, 3, "2026-10-01T15:05:00.000Z");
    expect(await run(testEnv, open3, open3)).toMatchObject({ sent: 0 });
    // Full → open: sent; full again and open again inside 30 min: cooldown.
    await run(
      testEnv,
      mockSeats,
      reopen(SECTION, 2, "2026-10-01T15:06:00.000Z"),
    );
    tick(10);
    await run(
      testEnv,
      mockSeats,
      reopen(SECTION, 2, "2026-10-01T15:16:00.000Z"),
    );
    expect(sent).toHaveLength(1);
    tick(31);
    await run(
      testEnv,
      mockSeats,
      reopen(SECTION, 1, "2026-10-01T15:47:00.000Z"),
    );
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject).toBe("A seat opened in CMSC351 0101");

    // 20 a day per person, whatever they watch.
    for (let i = 0; i < 18; i++)
      await env.DB.prepare(
        `INSERT INTO seat_alert_sends (user_id, term_id, section_key, channel, dedupe_key, status, sent_at)
         VALUES ('tstudent', ?1, ?2, 'email', ?3, 'sent', ?4)`,
      )
        .bind(fixtureTermId, OTHER, `filler-${i}`, now().toISOString())
        .run();
    tick(31);
    await run(
      testEnv,
      mockSeats,
      reopen(SECTION, 1, "2026-10-01T16:20:00.000Z"),
    );
    expect(sent).toHaveLength(2);
  });

  it("starts from today's count, so a section that's open when watched waits to fill and reopen", async () => {
    const { testEnv, sent } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    // CMSC351-0101 is full in the published seats; with no previous file
    // the watch's own last count (0) is the "before".
    await student.watch(SECTION);
    await notifySeatChanges(
      testEnv,
      null,
      reopen(SECTION, 4, now().toISOString()),
      { now: now() },
    );
    expect(sent).toHaveLength(1);
  });

  it("refuses unknown sections, archived terms and more than the limit", async () => {
    const { testEnv } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    expect(await student.watch("CMSC351-9999")).toEqual({
      status: "unknown-section",
    });
    expect(await student.watch(SECTION, archivedFixtureTermId)).toEqual({
      status: "unknown-section",
    });
    const bad = await student.request("alerts/watch", {
      termId: fixtureTermId,
      sectionKey: SECTION,
      userId: "tclassmate",
    });
    expect(bad.status).toBe(400);

    const full = Object.entries(mockSeats.seats)
      .filter(([, s]) => s[0] === 0)
      .map(([key]) => key);
    const results = [];
    for (const key of full.slice(0, SEAT_WATCH_MAX_PER_USER + 1))
      results.push((await student.watch(key)).status);
    expect(results.slice(0, SEAT_WATCH_MAX_PER_USER)).not.toContain("too-many");
    expect(results.at(-1)).toBe("too-many");
  });

  it("needs a signed-in, same-origin request", async () => {
    const { testEnv } = makeEnv();
    const signedOut = await handleApi(
      new Request(`${ORIGIN}/api/alerts/watch`, {
        method: "POST",
        body: JSON.stringify({ termId: fixtureTermId, sectionKey: SECTION }),
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
      }),
      testEnv,
      { waitUntil: () => {} },
      now(),
    );
    expect(signedOut.status).toBe(401);
    const student = await signIn("tstudent", testEnv);
    const crossSite = await student.request(
      "alerts/watch",
      { termId: fixtureTermId, sectionKey: SECTION },
      { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    );
    expect(crossSite.status).toBe(403);
  });

  it("answers unavailable while the flag is off or without EMAIL, and still stops", async () => {
    for (const overrides of [
      { SEAT_ALERTS_ENABLED: "false" },
      { EMAIL: undefined },
    ]) {
      const { testEnv, sent } = makeEnv(overrides);
      const student = await signIn("tstudent", testEnv);
      expect(await student.watch(SECTION)).toEqual({ status: "unavailable" });
      expect(await student.list()).toEqual({ status: "unavailable" });
      expect(await student.unwatch(SECTION)).toEqual({ status: "stopped" });
      expect(
        await run(testEnv, mockSeats, reopen(SECTION, 3, now().toISOString())),
      ).toEqual({ checked: 0, sent: 0, skipped: "disabled" });
      expect(sent).toHaveLength(0);
    }
  });
});

describe("seat watches by push (V2.md §6.5)", () => {
  /** A device of tstudent's with push on, and what its push service got. */
  async function aDevice() {
    const pair = await generateKeyPair("ECDH", true);
    const uaPublic = await exportPublicKey(pair.publicKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    await saveSubscription(env.DB, {
      userId: "tstudent",
      endpoint: "https://fcm.googleapis.com/fcm/send/phone",
      p256dh: toBase64url(uaPublic),
      auth: toBase64url(authSecret),
      label: "iPhone · Safari",
      now: now(),
    });
    const received: unknown[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const body = new Uint8Array(await new Request(input, init).arrayBuffer());
      const plain = await decryptPushPayload({
        body,
        uaPrivate: pair.privateKey,
        uaPublic,
        authSecret,
      });
      received.push(plain && JSON.parse(new TextDecoder().decode(plain)));
      return new Response(null, { status: 201 });
    };
    return { received, fetcher };
  }

  const pushEnv = () =>
    makeEnv({
      PUSH_ENABLED: "true",
      VAPID_PUBLIC_KEY: TEST_VAPID_KEYS.publicKey,
      VAPID_PRIVATE_KEY: TEST_VAPID_KEYS.privateKey,
    } as Partial<ApiEnv>);

  it("pushes to the person's devices as well as emailing, once per reopen", async () => {
    const { testEnv, sent } = pushEnv();
    const student = await signIn("tstudent", testEnv);
    await student.watch(SECTION);
    const phone = await aDevice();
    const after = reopen(SECTION, 3, "2026-10-01T15:05:00.000Z");
    const go = () =>
      notifySeatChanges(testEnv, mockSeats, after, {
        now: now(),
        fetch: phone.fetcher,
      });
    expect(await go()).toEqual({ checked: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(phone.received).toEqual([
      {
        v: 1,
        type: "seat-open",
        title: "A seat opened in CMSC351 0101",
        body: "3 of 120 open. Register on Testudo before it's gone.",
        url: `/schedule?term=${fixtureTermId}&course=CMSC351`,
        tag: `seat:${fixtureTermId}:${SECTION}`,
      },
    ]);
    // A retried run sends neither again.
    expect(await go()).toMatchObject({ sent: 0 });
    expect(phone.received).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("follows the person's settings: push only, or nothing", async () => {
    const { testEnv, sent } = pushEnv();
    const student = await signIn("tstudent", testEnv);
    await student.watch(SECTION);
    const phone = await aDevice();
    await writeSettings(
      env.DB,
      "tstudent",
      {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatOpen: { push: true, email: false },
      },
      now(),
    );
    const run = (asOf: string) =>
      notifySeatChanges(testEnv, mockSeats, reopen(SECTION, 2, asOf), {
        now: now(),
        fetch: phone.fetcher,
      });
    expect(await run(now().toISOString())).toMatchObject({ sent: 1 });
    expect(sent).toEqual([]);
    expect(phone.received).toHaveLength(1);

    tick(60);
    await writeSettings(
      env.DB,
      "tstudent",
      {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatOpen: { push: false, email: false },
      },
      now(),
    );
    expect(await run(now().toISOString())).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
    expect(phone.received).toHaveLength(1);
  });
});

describe("the one-click stop link", () => {
  const post = (url: string, testEnv: ApiEnv, method = "POST") =>
    handleApi(
      new Request(url, {
        method,
        body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "CF-Connecting-IP": "203.0.113.9",
        },
      }),
      testEnv,
      { waitUntil: () => {} },
      now(),
    );

  it("stops that one watch on POST, and never on GET", async () => {
    const { testEnv, sent } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    await student.watch(SECTION);
    await student.watch(OTHER);
    await run(testEnv, mockSeats, reopen(SECTION, 1, now().toISOString()));
    const header = sent[0]?.headers?.["List-Unsubscribe"] ?? "";
    const url = header.slice(1, -1);
    expect(url).toMatch(/^https:\/\/terpsicle\.com\/api\/alerts\/one-click\?/);

    // A link scanner's GET goes to Settings and changes nothing.
    const get = await post(url, testEnv, "GET");
    expect(get.status).toBe(303);
    expect(get.headers.get("Location")).toBe(`${ORIGIN}/settings#watching`);
    expect((await student.list()).status === "ok").toBe(true);
    let listed = await student.list();
    expect(listed.status === "ok" && listed.watches).toHaveLength(2);

    expect((await post(url, testEnv)).status).toBe(200);
    listed = await student.list();
    expect(
      listed.status === "ok" && listed.watches.map((w) => w.sectionKey),
    ).toEqual([OTHER]);
    // Again: still fine.
    expect((await post(url, testEnv)).status).toBe(200);
  });

  it("refuses a link for someone else's watch", async () => {
    const { testEnv } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    const classmate = await signIn("tclassmate", testEnv);
    await classmate.watch(SECTION);
    const mine = await oneClickStopUrl(testEnv.DATA, ORIGIN, {
      userId: "tstudent",
      termId: fixtureTermId,
      sectionKey: SECTION,
    });
    const forged = mine.replace("u=tstudent", "u=tclassmate");
    expect((await post(forged, testEnv)).status).toBe(400);
    const theirs = await classmate.list();
    expect(theirs.status === "ok" && theirs.watches).toHaveLength(1);
    expect((await student.list()).status).toBe("ok");
  });
});

describe("the end of a term", () => {
  it("ends watches whose term is no longer active, and keeps the rest", async () => {
    const { testEnv } = makeEnv();
    const student = await signIn("tstudent", testEnv);
    await student.watch(SECTION);
    // A watch from a term that has since been archived.
    await env.DB.prepare(
      `INSERT INTO seat_watches (user_id, term_id, section_key, created_at)
       VALUES ('tstudent', ?1, ?2, ?3)`,
    )
      .bind(archivedFixtureTermId, SECTION, now().toISOString())
      .run();
    const terms = TermsFileSchema.parse(
      await (await env.DATA.get(TERMS_KEY))?.json(),
    );
    expect(
      terms.terms.find((t) => t.id === archivedFixtureTermId)?.status,
    ).toBe("archived");

    expect(await endPastTermWatches(testEnv)).toEqual({
      terms: 1,
      watches: 1,
    });
    const listed = await student.list();
    expect(
      listed.status === "ok" && listed.watches.map((w) => w.termId),
    ).toEqual([fixtureTermId]);
    // The daily job runs it.
    await env.DB.prepare(
      `INSERT INTO seat_watches (user_id, term_id, section_key, created_at)
       VALUES ('tstudent', ?1, ?2, ?3)`,
    )
      .bind(archivedFixtureTermId, OTHER, now().toISOString())
      .run();
    await runDailyJob({ env: env as Env, now: now() });
    const after = await student.list();
    expect(after.status === "ok" && after.watches).toHaveLength(1);
  });
});
