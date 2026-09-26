// End to end through the real router, D1 and R2 (BUILD.md §5: seat alerts are
// tested this way before SEAT_ALERTS_ENABLED turns on). Email goes to a mock
// EMAIL binding; links are read back out of the sent messages.
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  type SeatsFile,
  SubscriptionIdSchema,
  TokenSchema,
} from "~/core/schema";
import {
  archivedFixtureTermId,
  buildMockDataFiles,
  fixtureTermId,
  mockSeats,
} from "~/fixtures";
import { type ApiEnv, handleApi } from "../api/router";
import { api } from "../fns/api";
import { notifySeatChanges } from "./notify";

type Sent = {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

function mockEmail() {
  const sent: Sent[] = [];
  const binding = {
    send: vi.fn(async (message: Sent) => {
      sent.push(message);
      return { messageId: `msg-${sent.length}` };
    }),
  };
  return { sent, binding: binding as unknown as SendEmail };
}

function makeEnv(overrides: Partial<ApiEnv> = {}) {
  const email = mockEmail();
  const testEnv: ApiEnv = {
    ...env,
    SEAT_ALERTS_ENABLED: "true",
    EMAIL: email.binding,
    ...overrides,
  };
  return { testEnv, sent: email.sent };
}

let clock = Date.parse("2026-10-01T15:00:00.000Z");
const tick = (minutes: number) => {
  clock += minutes * 60_000;
};

/** The typed browser client, wired straight into the Worker's router. */
function client(testEnv: ApiEnv, ip = "203.0.113.7") {
  const fetcher: typeof fetch = async (input, init) =>
    handleApi(
      new Request(`https://terpsicle.com${String(input)}`, {
        ...init,
        headers: { ...init?.headers, "CF-Connecting-IP": ip },
      }),
      testEnv,
      { waitUntil: () => undefined },
      new Date(clock),
    );
  return { fetcher };
}

const tokenFrom = (message: Sent | undefined, path: string) => {
  const match = message?.text.match(
    new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`),
  );
  return TokenSchema.parse(match?.[1]);
};

beforeAll(async () => {
  // The mock catalog, exactly as the jobs would publish it.
  for (const [key, bytes] of await buildMockDataFiles()) {
    if (key.startsWith("catalog/")) await env.DATA.put(key, bytes);
  }
});

const SECTION = "CMSC351-0101"; // Full in the mock seats: [0, 120, 14, null].

describe("seat alerts, end to end", () => {
  it("subscribe → dedupe → confirm → notify → unsubscribe with confirmation", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv);
    const input = {
      email: "  Testudo@UMD.edu ",
      termId: fixtureTermId,
      sectionKey: SECTION,
    };

    // Subscribe: one confirmation email with a link into the app.
    expect(await api.alerts.subscribe(input, opts)).toEqual({
      status: "check-email",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("testudo@umd.edu");
    expect(sent[0]?.subject).toBe("Confirm your seat alert for CMSC351 0101");
    const confirmToken = tokenFrom(sent[0], "/alerts/confirm");

    // Subscribing again right away: same answer, no second email.
    expect(await api.alerts.subscribe(input, opts)).toEqual({
      status: "check-email",
    });
    expect(sent).toHaveLength(1);

    // Confirm: now active, and this browser gets a manage token.
    tick(1);
    const confirmed = await api.alerts.confirm({ token: confirmToken }, opts);
    if (confirmed.status !== "confirmed") throw new Error(confirmed.status);
    expect(confirmed).toMatchObject({
      termId: fixtureTermId,
      sectionKey: SECTION,
    });
    SubscriptionIdSchema.parse(confirmed.subscriptionId);
    const { subscriptionId, manageToken } = confirmed;
    expect(await api.alerts.confirm({ token: confirmToken }, opts)).toEqual({
      status: "already-confirmed",
      termId: fixtureTermId,
      sectionKey: SECTION,
    });
    expect(
      await api.alerts.status(
        { items: [{ subscriptionId, manageToken }] },
        opts,
      ),
    ).toEqual({ status: "ok", items: [{ subscriptionId, status: "active" }] });

    // Signing up again later: the email (not the API) says "already watching".
    tick(15);
    expect(await api.alerts.subscribe(input, opts)).toEqual({
      status: "check-email",
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject).toBe("You're already watching CMSC351 0101");
    expect(sent[1]?.headers?.["List-Unsubscribe"]).toMatch(
      /^<https:\/\/terpsicle\.com\/alerts\/unsubscribe\?token=/,
    );

    // The seats cron: the full section reopens → one alert email.
    const before: SeatsFile = mockSeats;
    const after: SeatsFile = {
      ...mockSeats,
      asOf: "2026-10-01T15:30:00.000Z",
      seats: { ...mockSeats.seats, [SECTION]: [3, 120, 11, null] },
    };
    tick(10);
    const result = await notifySeatChanges(testEnv, before, after, {
      now: new Date(clock),
    });
    expect(result.sent).toBe(1);
    const alert = sent[2];
    expect(alert?.subject).toBe("3 seats opened in CMSC351 0101");
    expect(alert?.text).toContain("Seats: 3 of 120 open");
    expect(alert?.text).toContain(
      `https://terpsicle.com/schedule?term=${fixtureTermId}&course=CMSC351`,
    );
    expect(alert?.html).toContain("CMSC351 0101");
    expect(alert?.headers?.["List-Unsubscribe"]).toMatch(
      /^<https:\/\/terpsicle\.com\/alerts\/unsubscribe\?token=/,
    );
    expect(alert?.headers).not.toHaveProperty("List-Unsubscribe-Post");

    // A retried cron run with the same snapshot sends nothing more.
    expect(
      (
        await notifySeatChanges(testEnv, before, after, {
          now: new Date(clock),
        })
      ).sent,
    ).toBe(0);
    // Refills and reopens within the cooldown: still nothing.
    const full = {
      ...after,
      seats: { ...after.seats, [SECTION]: [0, 120, 12, null] },
    } satisfies SeatsFile;
    await notifySeatChanges(testEnv, after, full, { now: new Date(clock) });
    tick(5);
    const again = { ...after, asOf: "2026-10-01T15:40:00.000Z" };
    expect(
      (await notifySeatChanges(testEnv, full, again, { now: new Date(clock) }))
        .sent,
    ).toBe(0);
    expect(sent).toHaveLength(3);

    // Unsubscribe from the alert's link: look up first, then confirm.
    const stopToken = tokenFrom(alert, "/alerts/unsubscribe");
    expect(await api.alerts.lookup({ token: stopToken }, opts)).toEqual({
      status: "found",
      termId: fixtureTermId,
      sectionKey: SECTION,
      subscriptionStatus: "active",
    });
    expect(await api.alerts.unsubscribe({ token: stopToken }, opts)).toEqual({
      status: "unsubscribed",
      termId: fixtureTermId,
      sectionKey: SECTION,
    });
    // Idempotent, and the browser's own token sees it too.
    expect(
      (await api.alerts.unsubscribe({ token: stopToken }, opts)).status,
    ).toBe("unsubscribed");
    expect(
      await api.alerts.status(
        { items: [{ subscriptionId, manageToken }] },
        opts,
      ),
    ).toEqual({
      status: "ok",
      items: [{ subscriptionId, status: "unsubscribed" }],
    });

    // No more alerts after unsubscribing, even past the cooldown.
    tick(60);
    const reopened = { ...after, asOf: "2026-10-01T17:00:00.000Z" };
    expect(
      (
        await notifySeatChanges(testEnv, full, reopened, {
          now: new Date(clock),
        })
      ).sent,
    ).toBe(0);
    expect(sent).toHaveLength(3);
  });

  it("gives the same answer for new, pending and watching addresses", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, "198.51.100.20");
    const answers = [];
    for (const email of ["new@umd.edu", "new@umd.edu", "other@umd.edu"]) {
      answers.push(
        await api.alerts.subscribe(
          { email, termId: fixtureTermId, sectionKey: "CMSC131-0101" },
          opts,
        ),
      );
    }
    expect(new Set(answers.map((a) => JSON.stringify(a)))).toEqual(
      new Set([JSON.stringify({ status: "check-email" })]),
    );
    expect(sent.map((m) => m.to)).toEqual(["new@umd.edu", "other@umd.edu"]);
  });

  it("stores only token hashes and a lowercase address", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, "198.51.100.21");
    await api.alerts.subscribe(
      {
        email: "Hash@UMD.edu",
        termId: fixtureTermId,
        sectionKey: "CMSC131-0102",
      },
      opts,
    );
    const token = tokenFrom(sent[0], "/alerts/confirm");
    const tables = await env.DB.prepare("SELECT * FROM alert_tokens").all();
    expect(JSON.stringify(tables.results)).not.toContain(token);
    const sub = await env.DB.prepare(
      "SELECT email FROM alert_subscriptions WHERE section_key = 'CMSC131-0102'",
    ).first<{ email: string }>();
    expect(sub?.email).toBe("hash@umd.edu");
    const counters = await env.DB.prepare("SELECT name FROM counters").all<{
      name: string;
    }>();
    expect(JSON.stringify(counters.results)).not.toContain("198.51.100.21");
  });

  it("rejects unknown sections, archived terms and bad input", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, "198.51.100.22");
    expect(
      await api.alerts.subscribe(
        {
          email: "a@umd.edu",
          termId: fixtureTermId,
          sectionKey: "CMSC351-9999",
        },
        opts,
      ),
    ).toEqual({ status: "unknown-section" });
    const bad = await handleApi(
      new Request("https://terpsicle.com/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "a@umd.edu",
          termId: fixtureTermId,
          sectionKey: SECTION,
          extra: 1,
        }),
      }),
      testEnv,
      { waitUntil: () => undefined },
    );
    expect(bad.status).toBe(400);
    const formPost = await handleApi(
      new Request("https://terpsicle.com/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          email: "a@umd.edu",
          termId: fixtureTermId,
          sectionKey: SECTION,
        }),
      }),
      testEnv,
      { waitUntil: () => undefined },
    );
    expect(formPost.status).toBe(400);
    expect(sent).toHaveLength(0);
    expect(await api.alerts.confirm({ token: "x".repeat(43) }, opts)).toEqual({
      status: "invalid-token",
    });
    expect(await api.alerts.lookup({ token: "y".repeat(43) }, opts)).toEqual({
      status: "invalid-token",
    });
  });

  it("expires confirmation links after 48 hours", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, "198.51.100.23");
    await api.alerts.subscribe(
      {
        email: "late@umd.edu",
        termId: fixtureTermId,
        sectionKey: "CMSC131-0103",
      },
      opts,
    );
    const token = tokenFrom(sent[0], "/alerts/confirm");
    tick(49 * 60);
    expect(await api.alerts.confirm({ token }, opts)).toEqual({
      status: "invalid-token",
    });
  });

  it("rate-limits subscribes per IP without storing the IP", async () => {
    const { testEnv } = makeEnv();
    const opts = client(testEnv, "192.0.2.99");
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(
        await api.alerts.subscribe(
          {
            email: `r${i}@umd.edu`,
            termId: fixtureTermId,
            sectionKey: "CMSC131-0104",
          },
          opts,
        ),
      );
    }
    expect(results.slice(0, 10).every((r) => r.status === "check-email")).toBe(
      true,
    );
    expect(results[10]?.status).toBe("rate-limited");
    // Other endpoints report it as an API error.
    const status = await handleApi(
      new Request("https://terpsicle.com/api/nope", { method: "POST" }),
      testEnv,
      { waitUntil: () => undefined },
    );
    expect(status.status).toBe(404);
  });

  it("stays off behind the flag, and on previews without EMAIL", async () => {
    const off = makeEnv({ SEAT_ALERTS_ENABLED: "false" });
    const input = {
      email: "x@umd.edu",
      termId: fixtureTermId,
      sectionKey: SECTION,
    };
    expect(await api.alerts.subscribe(input, client(off.testEnv))).toEqual({
      status: "unavailable",
    });
    await expect(
      api.alerts.lookup({ token: "z".repeat(43) }, client(off.testEnv)),
    ).rejects.toMatchObject({
      reason: "unavailable",
    });
    // The app asks for status on every load: a plain answer, not a 503.
    expect(await api.alerts.status({ items: [] }, client(off.testEnv))).toEqual(
      { status: "unavailable" },
    );
    // ...answered before rate limiting, so it never counts against anyone.
    const counted = async () =>
      (
        await off.testEnv.DB.prepare(
          "SELECT COALESCE(SUM(count), 0) AS n FROM counters WHERE name LIKE 'alerts/status:%'",
        ).first<{ n: number }>()
      )?.n;
    const before = await counted();
    const statuses = await Promise.all(
      Array.from({ length: 125 }, () =>
        api.alerts.status({ items: [] }, client(off.testEnv)),
      ),
    );
    expect(statuses.every((s) => s.status === "unavailable")).toBe(true);
    expect(await counted()).toBe(before);
    const preview = makeEnv({ EMAIL: undefined });
    expect(await api.alerts.subscribe(input, client(preview.testEnv))).toEqual({
      status: "unavailable",
    });
    expect(
      await notifySeatChanges(off.testEnv, mockSeats, mockSeats, {
        now: new Date(clock),
      }),
    ).toEqual({ checked: 0, sent: 0, skipped: "disabled" });
    expect(off.sent).toHaveLength(0);
    expect(preview.sent).toHaveLength(0);
  });

  it("never lets a forged Host header into email links", async () => {
    const { testEnv, sent } = makeEnv();
    await handleApi(
      new Request("https://evil.example/api/alerts/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.30",
        },
        body: JSON.stringify({
          email: "host@umd.edu",
          termId: fixtureTermId,
          sectionKey: "CMSC131-0105",
        }),
      }),
      testEnv,
      { waitUntil: () => undefined },
      new Date(clock),
    );
    expect(sent[0]?.text).toContain(
      "https://terpsicle.com/alerts/confirm?token=",
    );
    expect(sent[0]?.text).not.toContain("evil.example");
  });
});

describe("seat alerts, abuse and safety", () => {
  const today = () => new Date(clock).toISOString().slice(0, 10);
  let ipSeq = 0;
  const freshIp = () => `198.18.0.${++ipSeq}`;
  const subscribeAs = (testEnv: ApiEnv, email: string, sectionKey: string) =>
    api.alerts.subscribe(
      { email, termId: fixtureTermId, sectionKey },
      client(testEnv, freshIp()),
    );

  it("caps signup emails per address per day, without changing the answer", async () => {
    const { testEnv, sent } = makeEnv();
    const sections = [
      "CMSC132-0101",
      "CMSC132-0102",
      "CMSC132-0103",
      "CMSC132-0201",
      "CMSC132-0105",
      "CMSC132-0106",
    ];
    const answers = [];
    for (const s of sections)
      answers.push(await subscribeAs(testEnv, "busy@umd.edu", s));
    expect(answers.every((a) => a.status === "check-email")).toBe(true);
    expect(sent.filter((m) => m.to === "busy@umd.edu")).toHaveLength(5);
  });

  it("stops signup emails at the global daily backstop", async () => {
    const { testEnv, sent } = makeEnv();
    await env.DB.prepare(
      `INSERT INTO counters (name, window_start, count) VALUES ('signup-emails', ?1, 300)
       ON CONFLICT (name, window_start) DO UPDATE SET count = 300`,
    )
      .bind(`${today()}T00:00:00.000Z`)
      .run();
    expect(
      await subscribeAs(testEnv, "global@umd.edu", "CMSC216-0101"),
    ).toEqual({ status: "check-email" });
    expect(sent).toHaveLength(0);
    await env.DB.prepare(
      "DELETE FROM counters WHERE name = 'signup-emails'",
    ).run();
  });

  it("keeps confirm and manage tokens apart, and status tied to its subscription", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, freshIp());
    await api.alerts.subscribe(
      {
        email: "tokens@umd.edu",
        termId: fixtureTermId,
        sectionKey: "CMSC216-0102",
      },
      opts,
    );
    const confirmToken = tokenFrom(sent[0], "/alerts/confirm");
    // A confirm token can't look up or stop a watch.
    expect(await api.alerts.lookup({ token: confirmToken }, opts)).toEqual({
      status: "invalid-token",
    });
    expect(await api.alerts.unsubscribe({ token: confirmToken }, opts)).toEqual(
      {
        status: "invalid-token",
      },
    );
    const confirmed = await api.alerts.confirm({ token: confirmToken }, opts);
    if (confirmed.status !== "confirmed") throw new Error(confirmed.status);
    // A manage token can't confirm, or unlock another subscription's status.
    expect(
      await api.alerts.confirm({ token: confirmed.manageToken }, opts),
    ).toEqual({ status: "invalid-token" });
    const stranger = "A".repeat(22);
    expect(
      await api.alerts.status(
        {
          items: [
            { subscriptionId: stranger, manageToken: confirmed.manageToken },
          ],
        },
        opts,
      ),
    ).toEqual({
      status: "ok",
      items: [{ subscriptionId: stranger, status: "unknown" }],
    });
  });

  it("marks trial emails with a subject prefix when one is set", async () => {
    const { testEnv, sent } = makeEnv({ EMAIL_SUBJECT_PREFIX: "[Test] " });
    await subscribeAs(testEnv, "trial@umd.edu", "CMSC216-0103");
    expect(sent[0]?.subject).toBe(
      "[Test] Confirm your seat alert for CMSC216 0103",
    );
  });

  it("refuses archived terms", async () => {
    const { testEnv, sent } = makeEnv();
    const archived = await api.alerts.subscribe(
      {
        email: "old@umd.edu",
        termId: archivedFixtureTermId,
        sectionKey: "CMSC131-0101",
      },
      client(testEnv, freshIp()),
    );
    expect(archived).toEqual({ status: "unknown-section" });
    expect(sent).toHaveLength(0);
  });

  it("never emails unconfirmed watchers, and caps alerts per address per day", async () => {
    const { testEnv, sent } = makeEnv();
    const opts = client(testEnv, freshIp());
    // Pending only: never alerted.
    await api.alerts.subscribe(
      {
        email: "pending@umd.edu",
        termId: fixtureTermId,
        sectionKey: "STAT400-0301",
      },
      opts,
    );
    // Confirmed, but already at today's 20 alerts.
    await api.alerts.subscribe(
      {
        email: "capped@umd.edu",
        termId: fixtureTermId,
        sectionKey: "STAT400-0301",
      },
      opts,
    );
    const confirmEmail = sent.find((m) => m.to === "capped@umd.edu");
    const confirmed = await api.alerts.confirm(
      { token: tokenFrom(confirmEmail, "/alerts/confirm") },
      opts,
    );
    expect(confirmed.status).toBe("confirmed");
    for (let i = 0; i < 20; i++) {
      await env.DB.prepare(
        `INSERT INTO email_sends (email, kind, dedupe_key, status, sent_at)
         VALUES ('capped@umd.edu', 'seat-open', ?1, 'sent', ?2)`,
      )
        .bind(`cap-test-${i}`, new Date(clock).toISOString())
        .run();
    }
    const before = sent.length;
    const after = {
      ...mockSeats,
      asOf: new Date(clock).toISOString(),
      seats: { ...mockSeats.seats, "STAT400-0301": [4, 60, 0, null] },
    } satisfies SeatsFile;
    const result = await notifySeatChanges(testEnv, mockSeats, after, {
      now: new Date(clock),
    });
    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(before);
  });
});
