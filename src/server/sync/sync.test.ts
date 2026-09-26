// Plan sync end to end through the real router and D1 (docs/V2.md §5.2–5.3):
// the rev compare-and-swap under concurrent pushes, pull pages and resets,
// limits, who may call it, and the daily job's tombstone pruning.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findTestUser } from "~/core/auth";
import {
  type Plan,
  SYNC_MAX_BODY_BYTES,
  SYNC_MAX_PLANS,
  SYNC_MAX_PUSH_DOCS,
  SYNC_PULL_PAGE,
  type SyncDoc,
  type SyncPullResult,
  SyncPullResultSchema,
  type SyncPushDoc,
  type SyncPushResult,
  SyncPushResultSchema,
  syncBodyBytes,
} from "~/core/schema";
import { aPlan, aPlanCourse, aSettingsDoc } from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { markDeleting, upsertUser } from "../auth/store";

const ORIGIN = "https://terpsicle.com";
const DAY = 86_400_000;

let clock = Date.parse("2026-10-01T15:00:00.000Z");
const now = () => new Date(clock);

beforeEach(async () => {
  clock = Date.parse("2026-10-01T15:00:00.000Z");
  await env.DB.batch(
    ["sync_docs", "sync_heads", "counters", "sessions", "users"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});

/** A signed-in browser for one of TEST_USERS, straight to a session. */
async function signIn(userId: string): Promise<Device> {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, now());
  const setCookie = await startSession(env.DB, userId, now());
  return new Device(setCookie.split(";")[0] ?? "");
}

class Device {
  constructor(readonly cookie: string) {}

  request(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return handleApi(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: this.cookie,
          ...headers,
        },
      }),
      env as ApiEnv,
      { waitUntil: () => {} },
      now(),
    );
  }

  async push(...docs: SyncPushDoc[]): Promise<SyncPushResult> {
    const response = await this.request("/api/sync/push", { docs });
    expect(response.status).toBe(200);
    return SyncPushResultSchema.parse(await response.json());
  }

  async pull(since: number): Promise<SyncPullResult> {
    const response = await this.request("/api/sync/pull", { since });
    expect(response.status).toBe(200);
    return SyncPullResultSchema.parse(await response.json());
  }

  /** Every doc from `since`, page by page; fails on a reset. */
  async pullAll(since = 0): Promise<{ docs: SyncDoc[]; cursor: number }> {
    const docs: SyncDoc[] = [];
    let cursor = since;
    for (;;) {
      const page = await this.pull(cursor);
      if (page.status !== "ok") throw new Error("unexpected reset");
      docs.push(...page.docs);
      cursor = page.cursor;
      if (!page.more) return { docs, cursor };
    }
  }
}

const planId = (n: number) => `plan_${String(n).padStart(4, "0")}_test`;

const savePlan = (plan: Plan, baseRev = 0): SyncPushDoc => ({
  kind: "plan",
  id: plan.id,
  baseRev,
  body: plan,
});

const deletePlan = (id: string, baseRev: number): SyncPushDoc => ({
  kind: "plan",
  id,
  baseRev,
  body: null,
});

const saveSettings = (baseRev = 0): SyncPushDoc => ({
  kind: "settings",
  id: "settings",
  baseRev,
  body: aSettingsDoc(),
});

const count = async (sql: string, ...params: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...params)
    .first<number>("n");

describe("sync/push", () => {
  it("saves a new doc, then only on the rev it last saw", async () => {
    const phone = await signIn("tstudent");
    const plan = aPlan({ id: planId(1) });
    expect(await phone.push(savePlan(plan), saveSettings())).toEqual({
      results: [
        { kind: "plan", id: plan.id, status: "ok", rev: 1 },
        { kind: "settings", id: "settings", status: "ok", rev: 2 },
      ],
    });

    const renamed = { ...plan, name: "Plan B" };
    expect((await phone.push(savePlan(renamed, 1))).results).toEqual([
      { kind: "plan", id: plan.id, status: "ok", rev: 3 },
    ]);

    // Another device still on rev 1 gets the server's version back.
    const laptop = await signIn("tstudent");
    const stale = await laptop.push(savePlan({ ...plan, name: "Mine" }, 1));
    expect(stale.results).toEqual([
      {
        kind: "plan",
        id: plan.id,
        status: "conflict",
        doc: {
          kind: "plan",
          id: plan.id,
          rev: 3,
          updatedAt: now().toISOString(),
          body: renamed,
        },
      },
    ]);
    // "New" when it isn't is a conflict too, for plans and settings.
    const fresh = await laptop.push(savePlan(plan, 0), saveSettings(0));
    expect(fresh.results.map((r) => r.status)).toEqual([
      "conflict",
      "conflict",
    ]);
    expect(fresh.results[1]).toMatchObject({
      doc: { kind: "settings", rev: 2, body: aSettingsDoc() },
    });
  });

  it("keeps docs independent, and answers in the push's order", async () => {
    const phone = await signIn("tstudent");
    const [a, b, c] = [1, 2, 3].map((n) => aPlan({ id: planId(n) }));
    if (!a || !b || !c) throw new Error("unreachable");
    await phone.push(savePlan(a));
    const results = await phone.push(
      savePlan(b),
      savePlan(a, 0), // stale
      savePlan(c),
    );
    expect(results.results).toMatchObject([
      { id: b.id, status: "ok", rev: 2 },
      { id: a.id, status: "conflict", doc: { rev: 1 } },
      { id: c.id, status: "ok", rev: 3 },
    ]);
  });

  it("lets exactly one of several concurrent saves win", async () => {
    const devices = await Promise.all(
      Array.from({ length: 6 }, () => signIn("tstudent")),
    );
    const plan = aPlan({ id: planId(1) });
    const race = async (baseRev: number) => {
      const results = await Promise.all(
        devices.map((d, i) =>
          d.push(savePlan({ ...plan, name: `Device ${i}` }, baseRev)),
        ),
      );
      const outcomes = results.map((r) => r.results[0]);
      const winners = outcomes.filter((r) => r?.status === "ok");
      expect(winners).toHaveLength(1);
      const winner = winners[0];
      if (winner?.status !== "ok") throw new Error("unreachable");
      // Every loser is shown the winner's version.
      for (const r of outcomes)
        if (r?.status === "conflict")
          expect(r.doc).toMatchObject({ rev: winner.rev });
        else expect(r).toBe(winner);
      return winner.rev;
    };
    const first = await race(0);
    const second = await race(first);
    expect(second).toBe(first + 1);
    const { docs } = (await devices[0]?.pullAll()) ?? { docs: [] };
    expect(docs).toHaveLength(1);
    expect(docs[0]?.rev).toBe(second);
  });

  it("deletes a plan as a tombstone, and an edit can bring it back", async () => {
    const phone = await signIn("tstudent");
    const plan = aPlan({ id: planId(1) });
    await phone.push(savePlan(plan));
    expect((await phone.push(deletePlan(plan.id, 1))).results).toEqual([
      { kind: "plan", id: plan.id, status: "ok", rev: 2 },
    ]);
    const pulled = await phone.pullAll();
    expect(pulled.docs).toEqual([
      {
        kind: "plan",
        id: plan.id,
        rev: 2,
        updatedAt: now().toISOString(),
        body: null,
      },
    ]);
    // The tombstone keeps the plan's term.
    expect(
      await env.DB.prepare("SELECT term_id FROM sync_docs").first("term_id"),
    ).toBe(plan.termId);
    // Edited elsewhere after all: saved again on the tombstone's rev.
    expect((await phone.push(savePlan(plan, 2))).results[0]).toMatchObject({
      status: "ok",
      rev: 3,
    });
  });

  it("never deletes the settings doc", async () => {
    const phone = await signIn("tstudent");
    const response = await phone.request("/api/sync/push", {
      docs: [{ kind: "settings", id: "settings", baseRev: 0, body: null }],
    });
    expect(response.status).toBe(400);
  });
});

describe("sync/pull", () => {
  it("pages through everything in rev order", async () => {
    const phone = await signIn("tstudent");
    // SYNC_MAX_PLANS live plans, some deleted and replaced, and the settings
    // doc: more docs than one page holds.
    const plans = Array.from({ length: SYNC_MAX_PLANS }, (_, i) =>
      aPlan({ id: planId(i), name: `Plan ${i}` }),
    );
    for (let i = 0; i < plans.length; i += SYNC_MAX_PUSH_DOCS)
      await phone.push(
        ...plans.slice(i, i + SYNC_MAX_PUSH_DOCS).map((p) => savePlan(p)),
      );
    const deleted = plans.slice(0, 40);
    await phone.push(...deleted.map((p, i) => deletePlan(p.id, i + 1)));
    const extra = Array.from({ length: 40 }, (_, i) =>
      aPlan({ id: planId(1000 + i) }),
    );
    await phone.push(...extra.map((p) => savePlan(p)), saveSettings());
    const total = SYNC_MAX_PLANS + extra.length + 1;
    expect(total).toBeGreaterThan(SYNC_PULL_PAGE);

    const first = await phone.pull(0);
    if (first.status !== "ok") throw new Error("unexpected reset");
    expect(first.docs).toHaveLength(SYNC_PULL_PAGE);
    expect(first.more).toBe(true);
    expect(first.cursor).toBe(first.docs.at(-1)?.rev);

    // A doc saved between pages moves past the cursor, so it isn't missed.
    const moved = first.docs.find((d) => d.kind === "plan" && d.body);
    if (moved?.kind !== "plan" || !moved.body) throw new Error("unreachable");
    await phone.push(savePlan({ ...moved.body, name: "Moved" }, moved.rev));

    const rest = await phone.pullAll(first.cursor);
    const all = [...first.docs, ...rest.docs];
    const revs = all.map((d) => d.rev);
    expect(revs).toEqual([...revs].sort((a, b) => a - b));
    expect(new Set(revs).size).toBe(revs.length);
    expect(all).toHaveLength(total + 1);
    const last = all.findLast((d) => d.id === moved.id);
    expect(last?.kind === "plan" && last.body?.name).toBe("Moved");
    expect(
      all.filter((d) => d.kind === "plan" && d.body === null),
    ).toHaveLength(deleted.length);

    // Up to date: an empty page keeps the cursor.
    expect(await phone.pull(rest.cursor)).toEqual({
      status: "ok",
      cursor: rest.cursor,
      docs: [],
      more: false,
    });
  });

  it("resets a cursor ahead of the account", async () => {
    const phone = await signIn("tstudent");
    expect(await phone.pull(0)).toEqual({
      status: "ok",
      cursor: 0,
      docs: [],
      more: false,
    });
    // An account deleted and made again starts its revs over.
    expect(await phone.pull(12)).toEqual({ status: "reset" });
  });
});

describe("who may sync", () => {
  it("needs a session", async () => {
    const signedOut = new Device("");
    for (const [path, body] of [
      ["/api/sync/push", { docs: [saveSettings()] }],
      ["/api/sync/pull", { since: 0 }],
    ] as const) {
      const response = await signedOut.request(path, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    const forged = new Device("__Host-session=not-a-real-session-token");
    expect((await forged.request("/api/sync/pull", { since: 0 })).status).toBe(
      401,
    );
  });

  it("refuses requests from other origins", async () => {
    const phone = await signIn("tstudent");
    const attempts: Record<string, string>[] = [
      { Origin: "https://evil.example" },
      { Origin: "https://reviews.terpsicle.com" },
      { "Sec-Fetch-Site": "same-site" },
      { "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of attempts) {
      const response = await phone.request(
        "/api/sync/push",
        { docs: [saveSettings()] },
        headers,
      );
      expect(response.status).toBe(403);
    }
    expect(await count("SELECT count(*) AS n FROM sync_docs")).toBe(0);
  });

  it("sends a refreshed session's cookie with every answer", async () => {
    const phone = await signIn("tstudent");
    clock += 2 * DAY;
    // Refused input still carries the new cookie: the old one stops working
    // a minute after the refresh.
    const refused = await phone.request("/api/sync/pull", { since: -1 });
    expect(refused.status).toBe(400);
    const cookie = refused.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(/^__Host-session=/);
    const renewed = new Device(cookie.split(";")[0] ?? "");
    clock += 60_001;
    expect((await phone.request("/api/sync/pull", { since: 0 })).status).toBe(
      401,
    );
    expect((await renewed.pull(0)).status).toBe("ok");
  });

  it("keeps each person's docs to themselves", async () => {
    const student = await signIn("tstudent");
    const classmate = await signIn("tclassmate");
    const plan = aPlan({ id: planId(1), name: "Mine" });
    await student.push(savePlan(plan), saveSettings());

    // The same ids are separate docs on another account, with its own revs.
    expect(await classmate.pullAll()).toEqual({ docs: [], cursor: 0 });
    const theirs = { ...plan, name: "Theirs" };
    expect((await classmate.push(savePlan(theirs))).results).toEqual([
      { kind: "plan", id: plan.id, status: "ok", rev: 1 },
    ]);
    // A rev from the other account doesn't reach across.
    expect(
      (await classmate.push(deletePlan(plan.id, 2))).results[0]?.status,
    ).toBe("conflict");

    const mine = await student.pullAll();
    expect(mine.docs).toHaveLength(2);
    expect(mine.docs[0]).toMatchObject({ body: { name: "Mine" } });
    const other = await classmate.pullAll();
    expect(other.docs).toEqual([
      expect.objectContaining({ id: plan.id, body: theirs }),
    ]);
  });
});

describe("limits", () => {
  it("refuses an oversized doc, batch or request", async () => {
    const phone = await signIn("tstudent");
    const courses = Array.from({ length: 400 }, (_, i) =>
      aPlanCourse({ courseCode: `CMSC${100 + i}` }),
    );
    const big = aPlan({ id: planId(1), courses });
    expect(syncBodyBytes(big)).toBeGreaterThan(SYNC_MAX_BODY_BYTES);
    const tooBig = await phone.request("/api/sync/push", {
      docs: [savePlan(big)],
    });
    expect(tooBig.status).toBe(400);

    const many = Array.from({ length: SYNC_MAX_PUSH_DOCS + 1 }, (_, i) =>
      savePlan(aPlan({ id: planId(i) })),
    );
    expect((await phone.request("/api/sync/push", { docs: many })).status).toBe(
      400,
    );

    // Sync's larger request cap is its own: pull keeps the default.
    const padded = JSON.stringify({ since: 0 }).replace(
      "{",
      `{${" ".repeat(20_000)}`,
    );
    expect((await phone.request("/api/sync/pull", padded)).status).toBe(400);
    expect(await count("SELECT count(*) AS n FROM sync_docs")).toBe(0);
  });

  it(`keeps an account to ${SYNC_MAX_PLANS} plans, not counting deleted ones`, async () => {
    const phone = await signIn("tstudent");
    for (let i = 0; i < SYNC_MAX_PLANS; i += SYNC_MAX_PUSH_DOCS)
      await phone.push(
        ...Array.from({ length: SYNC_MAX_PUSH_DOCS }, (_, k) =>
          savePlan(aPlan({ id: planId(i + k) })),
        ),
      );
    const extra = aPlan({ id: planId(9999) });
    const full = await phone.push(
      savePlan(extra),
      savePlan({ ...aPlan({ id: planId(0) }), name: "Still editable" }, 1),
      saveSettings(),
    );
    expect(full.results).toMatchObject([
      { id: extra.id, status: "too-many-plans" },
      { id: planId(0), status: "ok" },
      { id: "settings", status: "ok" },
    ]);
    // A stale base is still a conflict, whatever the count.
    expect((await phone.push(savePlan(extra, 5))).results[0]?.status).toBe(
      "conflict",
    );
    // Deleting one makes room.
    await phone.push(deletePlan(planId(1), 2));
    expect((await phone.push(savePlan(extra))).results[0]?.status).toBe("ok");
    expect(
      await count(
        "SELECT count(*) AS n FROM sync_docs WHERE kind = 'plan' AND deleted = 0",
      ),
    ).toBe(SYNC_MAX_PLANS);
  });

  it("limits requests per person per hour, not per address", async () => {
    const student = await signIn("tstudent");
    const classmate = await signIn("tclassmate");
    // Most of this hour's pulls are used up already.
    const hour = new Date(Math.floor(clock / 3_600_000) * 3_600_000);
    await env.DB.prepare(
      "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, ?3)",
    )
      .bind("user:tstudent:sync/pull", hour.toISOString(), 599)
      .run();
    expect((await student.request("/api/sync/pull", { since: 0 })).status).toBe(
      200,
    );
    const limited = await student.request("/api/sync/pull", { since: 0 });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Same IP, another person, and another route: unaffected.
    expect(
      (await classmate.request("/api/sync/pull", { since: 0 })).status,
    ).toBe(200);
    expect(
      (await student.request("/api/sync/push", { docs: [saveSettings()] }))
        .status,
    ).toBe(200);
    // The next hour starts over.
    clock = hour.getTime() + 3_600_000;
    expect((await student.request("/api/sync/pull", { since: 0 })).status).toBe(
      200,
    );
  });
});

describe("the daily job", () => {
  const daily = (at: number) =>
    runDailyJob({ env: env as Env, now: new Date(at) });

  it("prunes tombstones after 30 days and resets older cursors", async () => {
    const phone = await signIn("tstudent");
    const [a, b, c] = [1, 2, 3].map((n) => aPlan({ id: planId(n) }));
    if (!a || !b || !c) throw new Error("unreachable");
    await phone.push(savePlan(a), savePlan(b), savePlan(c)); // revs 1–3
    const deletedAt = clock;
    await phone.push(deletePlan(a.id, 1)); // rev 4
    clock += 10 * DAY;
    await phone.push(deletePlan(b.id, 2)); // rev 5

    await daily(deletedAt + 30 * DAY - 1);
    expect(await count("SELECT count(*) AS n FROM sync_docs")).toBe(3);

    clock = deletedAt + 30 * DAY + 1;
    await daily(clock);
    // The phone's session expired meanwhile.
    const phoneAgain = await signIn("tstudent");
    // Only the older tombstone went; live docs never do.
    const left = await env.DB.prepare(
      "SELECT doc_id, deleted FROM sync_docs ORDER BY rev",
    ).all();
    expect(left.results).toEqual([
      { doc_id: c.id, deleted: 0 },
      { doc_id: b.id, deleted: 1 },
    ]);
    expect(
      await env.DB.prepare("SELECT pruned_through AS n FROM sync_heads").first(
        "n",
      ),
    ).toBe(4);

    // A device that last pulled before the pruned delete starts over; one
    // that had seen it, or has nothing yet, carries on.
    expect(await phoneAgain.pull(3)).toEqual({ status: "reset" });
    expect((await phoneAgain.pull(4)).status).toBe("ok");
    const everything = await phoneAgain.pullAll(0);
    expect(everything.docs.map((d) => d.id)).toEqual([c.id, b.id]);

    // A save based on the pruned tombstone finds nothing there; on rev 0 it
    // comes back (an edit beats a delete).
    expect((await phoneAgain.push(savePlan(a, 4))).results[0]).toEqual({
      kind: "plan",
      id: a.id,
      status: "conflict",
      doc: null,
    });
    expect((await phoneAgain.push(savePlan(a, 0))).results[0]).toMatchObject({
      status: "ok",
      rev: 6,
    });

    // The next prune moves the mark up to the newer tombstone.
    clock += 40 * DAY;
    await daily(clock);
    expect(
      await env.DB.prepare("SELECT pruned_through AS n FROM sync_heads").first(
        "n",
      ),
    ).toBe(5);
  });

  it("takes a deleted account's docs with it", async () => {
    const phone = await signIn("tstudent");
    const classmate = await signIn("tclassmate");
    await phone.push(savePlan(aPlan({ id: planId(1) })), saveSettings());
    await classmate.push(saveSettings());
    await markDeleting(env.DB, "tstudent", new Date(clock + 7 * DAY));
    await daily(clock + 7 * DAY);
    expect(
      await count(
        "SELECT count(*) AS n FROM sync_docs WHERE user_id = ?1",
        "tstudent",
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM sync_heads WHERE user_id = ?1",
        "tstudent",
      ),
    ).toBe(0);
    expect(await count("SELECT count(*) AS n FROM sync_docs")).toBe(1);
  });
});
