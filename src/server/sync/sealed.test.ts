// Synced data sealed on the server with a key per account (docs/DATA.md §7.7,
// migrations/0025_sync_encryption.sql): what D1 holds can't be read without
// the account's key, a body only opens in its own row, a rotation of the
// Worker secret keeps old rows open, a deleted account's docs can't be read
// at all, and with no secret nothing is stored.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findTestUser } from "~/core/auth";
import {
  type SyncPullResult,
  SyncPullResultSchema,
  type SyncPushDoc,
  type SyncPushResult,
  SyncPushResultSchema,
} from "~/core/schema";
import { aFourYear, aPlan, aSettingsDoc } from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { markDeleting, upsertUser } from "../auth/store";
import {
  accountKey,
  rewrapAccountKeys,
  SealedDataError,
  TEST_USER_DATA_KEY,
  type UserDataEnv,
} from "../security/user-keys";
import { testBindings } from "../test-bindings";
import { livePlans, openedBodyFor, pullDocs, pushDocs } from "./store";

const ORIGIN = "https://terpsicle.com";
const DAY = 86_400_000;
const now = () => new Date("2026-10-01T15:00:00.000Z");

const base64url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** The worker tests' USER_DATA_KEY (vitest.config.ts), and a second one. */
const K1 = base64url("worker-test-user-data-key-one!!!");
const K2 = base64url("worker-test-user-data-key-two!!!");

/** The Worker's env with these key vars in place of the test env's. */
function withKeys(vars: Record<string, string | undefined>): ApiEnv & Env {
  const {
    USER_DATA_KEY: _k,
    USER_DATA_KEY_ID: _i,
    ...rest
  } = env as unknown as Record<string, unknown>;
  return { ...rest, PLAN_ENABLED: "true", ...vars } as unknown as ApiEnv & Env;
}

const k1Env = () => withKeys({ USER_DATA_KEY: K1, USER_DATA_KEY_ID: "k1" });

beforeEach(async () => {
  await env.DB.batch(
    [
      "sync_docs",
      "sync_heads",
      "user_keys",
      "chat_members",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
});

async function signIn(userId: string, apiEnv: () => ApiEnv = k1Env) {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, now());
  const cookie = (await startSession(env.DB, userId, now())).split(";")[0];
  const request = (path: string, body: unknown) =>
    handleApi(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: cookie ?? "",
        },
      }),
      apiEnv(),
      { waitUntil: () => {} },
      now(),
    );
  return {
    request,
    async push(...docs: SyncPushDoc[]): Promise<SyncPushResult> {
      const response = await request("/api/sync/push", { docs });
      expect(response.status).toBe(200);
      return SyncPushResultSchema.parse(await response.json());
    },
    async pull(since: number): Promise<SyncPullResult> {
      const response = await request("/api/sync/pull", { since });
      expect(response.status).toBe(200);
      return SyncPullResultSchema.parse(await response.json());
    },
  };
}

const plan = aPlan({ id: "plan_secret_1", name: "Secret schedule" });
const savePlan = (p = plan, baseRev = 0): SyncPushDoc => ({
  kind: "plan",
  id: p.id,
  baseRev,
  body: p,
});

const storedBodies = async () =>
  (
    await env.DB.prepare(
      "SELECT user_id, kind, doc_id, body FROM sync_docs ORDER BY rev",
    ).all<{ user_id: string; kind: string; doc_id: string; body: string }>()
  ).results;

describe("sealed sync bodies", () => {
  it("stores no readable JSON, and gives it back whole", async () => {
    const phone = await signIn("tstudent");
    const settings = aSettingsDoc();
    const fourYear = aFourYear({ name: "My four years" });
    await phone.push(
      savePlan(),
      { kind: "settings", id: "settings", baseRev: 0, body: settings },
      { kind: "four-year", id: fourYear.id, baseRev: 0, body: fourYear },
    );
    const rows = await storedBodies();
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.body).toMatch(/^v1\.acct\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
      expect(() => JSON.parse(row.body)).toThrow();
      expect(row.body).not.toContain("Secret");
    }
    const page = await phone.pull(0);
    expect(page).toMatchObject({
      status: "ok",
      docs: [
        { kind: "plan", id: plan.id, body: plan },
        { kind: "settings", body: settings },
        { kind: "four-year", body: fourYear },
      ],
    });
  });

  it("makes the account's key on its first save, wrapped by USER_DATA_KEY", async () => {
    const phone = await signIn("tstudent");
    expect(await accountKey(k1Env(), "tstudent")).toBeNull();
    // A deletion alone stores no body, so it needs no key.
    await phone.push({ kind: "plan", id: plan.id, baseRev: 0, body: null });
    expect(await accountKey(k1Env(), "tstudent")).toBeNull();
    await phone.push(savePlan());
    const keys = await env.DB.prepare(
      "SELECT user_id, wrapped_key, master_key_id FROM user_keys",
    ).all<{ user_id: string; wrapped_key: string; master_key_id: string }>();
    expect(keys.results).toEqual([
      {
        user_id: "tstudent",
        wrapped_key: expect.stringMatching(/^v1\.k1\./),
        master_key_id: "k1",
      },
    ]);
  });

  it("makes one key when two first saves race", async () => {
    const [a, b] = await Promise.all([signIn("tstudent"), signIn("tstudent")]);
    await Promise.all([
      a?.push(savePlan(aPlan({ id: "plan_race_a" }))),
      b?.push(savePlan(aPlan({ id: "plan_race_b" }))),
    ]);
    const page = await a?.pull(0);
    expect(page?.status === "ok" && page.docs).toHaveLength(2);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM user_keys").first("n"),
    ).toBe(1);
  });

  it("won't open a body moved to another row or another account", async () => {
    const student = await signIn("tstudent");
    const admin = await signIn("tadmin");
    const other = aPlan({ id: "plan_other_1", name: "Other" });
    await student.push(savePlan(), savePlan(other));
    await admin.push(savePlan(aPlan({ id: plan.id, name: "Admin's" })));
    const [secret] = (await storedBodies()).filter(
      (r) => r.user_id === "tstudent" && r.doc_id === plan.id,
    );
    if (!secret) throw new Error("no stored plan");

    // Into another of the same person's plans: the doc id is bound.
    await env.DB.prepare(
      "UPDATE sync_docs SET body = ?1 WHERE user_id = 'tstudent' AND doc_id = ?2",
    )
      .bind(secret.body, other.id)
      .run();
    await expect(pullDocs(k1Env(), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    // Into another account's row with the same doc id: the account is.
    await env.DB.prepare(
      "UPDATE sync_docs SET body = ?1 WHERE user_id = 'tadmin' AND doc_id = ?2",
    )
      .bind(secret.body, plan.id)
      .run();
    await expect(pullDocs(k1Env(), "tadmin", 0)).rejects.toThrow(
      SealedDataError,
    );
    await expect(livePlans(k1Env(), "tadmin", [plan.termId])).rejects.toThrow(
      SealedDataError,
    );
  });

  it("still opens old rows during a rotation, and after the daily job rewraps", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    const during = withKeys({
      USER_DATA_KEY: K2,
      USER_DATA_KEY_ID: "k2",
      USER_DATA_KEY_PREVIOUS: K1,
      USER_DATA_KEY_PREVIOUS_ID: "k1",
    });
    expect(await pullDocs(during, "tstudent", 0)).toMatchObject({
      docs: [{ body: plan }],
    });
    // Without the previous key the account's key won't unwrap yet.
    const after = withKeys({ USER_DATA_KEY: K2, USER_DATA_KEY_ID: "k2" });
    await expect(pullDocs(after, "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    await runDailyJob({ env: during, now: now() });
    expect(
      await env.DB.prepare("SELECT master_key_id FROM user_keys").first(
        "master_key_id",
      ),
    ).toBe("k2");
    expect(await rewrapAccountKeys(during)).toBe(0);
    expect(await pullDocs(after, "tstudent", 0)).toMatchObject({
      docs: [{ body: plan }],
    });
  });
  it("can't read a deleted account's docs, even with its rows put back", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    const [kept] = await storedBodies();
    if (!kept) throw new Error("no stored plan");
    await markDeleting(env.DB, "tstudent", now());
    await runDailyJob({
      env: k1Env(),
      now: new Date(now().getTime() + 7 * DAY),
    });
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM user_keys").first("n"),
    ).toBe(0);

    // The row comes back (as from a copy of the table), the key doesn't.
    await signIn("tstudent");
    const putBack = env.DB.prepare(
      `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
       VALUES ('tstudent', 'plan', ?1, ?2, 1000, 0, ?3, ?4)`,
    ).bind(plan.id, plan.termId, kept.body, now().toISOString());
    await putBack.run();
    await expect(pullDocs(k1Env(), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    await env.DB.prepare("DELETE FROM sync_docs").run();

    // Signing up again makes a new key, which doesn't open the old body.
    await (await signIn("tstudent")).push(
      savePlan(aPlan({ id: "plan_new_1" })),
    );
    await putBack.run();
    await expect(
      openedBodyFor(k1Env(), "tstudent", "plan", plan.id, kept.body),
    ).rejects.toThrow(SealedDataError);
    await expect(pullDocs(k1Env(), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
  });

  it("fails closed without USER_DATA_KEY: nothing stored, nothing read", async () => {
    const working = await signIn("tstudent");
    await working.push(savePlan());
    const before = await storedBodies();
    const missing = await signIn("tstudent", () => withKeys({}));
    for (const [path, body] of [
      ["/api/sync/push", { docs: [savePlan(aPlan({ id: "plan_plain" }))] }],
      ["/api/sync/pull", { since: 0 }],
    ] as const) {
      const response = await missing.request(path, body);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "unavailable" });
    }
    expect(await storedBodies()).toEqual(before);
    // A malformed key is as good as none.
    await expect(
      pushDocs(
        withKeys({ USER_DATA_KEY: "c2hvcnQ", USER_DATA_KEY_ID: "k1" }),
        "tstudent",
        [savePlan(aPlan({ id: "plan_plain" }))],
        now(),
      ),
    ).rejects.toThrow("USER_DATA_KEY");
  });

  it("uses the fixed test key in test mode, never the secret", async () => {
    const preview: UserDataEnv = withKeys({
      USER_DATA_KEY: K1,
      USER_DATA_KEY_ID: "k1",
      AUTH_TEST_MODE: "true",
    });
    await signIn("tstudent");
    await pushDocs(preview, "tstudent", [savePlan()], now());
    expect(
      await env.DB.prepare("SELECT master_key_id FROM user_keys").first(
        "master_key_id",
      ),
    ).toBe(TEST_USER_DATA_KEY.id);
    expect(await pullDocs(preview, "tstudent", 0)).toMatchObject({
      docs: [{ body: plan }],
    });
  });
});

describe("migration 0025: plain rows cleared", () => {
  const clearing = () =>
    (
      testBindings().migrations.find((m) => m.name.startsWith("0025_"))
        ?.queries ?? []
    ).filter((q) => q.includes("DELETE FROM"));

  it("answers a device that synced before it with a reset, then takes its docs again", async () => {
    expect(clearing()).toHaveLength(4);
    const phone = await signIn("tstudent");
    await phone.push(savePlan(), savePlan(aPlan({ id: "plan_second" }))); // revs 1–2
    expect(await phone.pull(0)).toMatchObject({ status: "ok", cursor: 2 });

    await env.DB.batch(clearing().map((q) => env.DB.prepare(q)));
    expect(await storedBodies()).toEqual([]);

    // The device's cursor is ahead of the empty account: pull everything.
    expect(await phone.pull(2)).toEqual({ status: "reset" });
    expect(await phone.pull(0)).toEqual({
      status: "ok",
      cursor: 0,
      docs: [],
      more: false,
    });
    // First sign-in's merge uploads its plans as new (base rev 0).
    const saved = await phone.push(
      savePlan(),
      savePlan(aPlan({ id: "plan_second" })),
    );
    expect(saved.results.map((r) => r.status)).toEqual(["ok", "ok"]);
    // A device that pushes before it pulls hears there's nothing stored,
    // and saves again from scratch (src/features/sync/engine.ts).
    expect(
      (await phone.push(savePlan(aPlan({ id: "plan_third" }), 7))).results[0],
    ).toMatchObject({ status: "conflict", doc: null });
  });
});
