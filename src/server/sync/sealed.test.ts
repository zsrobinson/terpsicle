// Synced data sealed on the server with a key per account (docs/DATA.md §7.7,
// migrations/0025_sync_encryption.sql): what D1 holds can't be read without
// the account's key, kept in R2 USER_KEYS; a body only opens in its own row,
// a rotation of the Worker secret keeps old rows open, a deleted account's
// docs can't be read at all, even with every D1 row put back, and with no
// secret or no bucket nothing is stored.
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
import { purgeKey } from "../auth/purge";
import { startSession } from "../auth/session";
import { markDeleting, upsertUser } from "../auth/store";
import {
  accountKeyPath,
  moveLegacyAccountKeys,
  openForAccount,
  rewrapAccountKeys,
  SealedDataError,
  sealForAccount,
  TEST_USER_DATA_KEY,
  type UserDataEnv,
  UserDataKeyMissing,
  userData,
  userDataForJob,
} from "../security/user-keys";
import { testBindings } from "../test-bindings";
import { listTasks, upsertTask } from "../todo/store";
import { livePlans, pullDocs, pushDocs } from "./store";
import { openedBodyFor } from "./testing";

const ORIGIN = "https://terpsicle.com";
/** Where test mode can be on (V2.md §4.6). */
const LOCALHOST = "http://localhost:3000";
const PREVIEW = "https://pr-249-terpsicle.zsrobinson.workers.dev";
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
/** Synced data's keys from this env, outside test mode. */
const keyed = (vars: UserDataEnv) => userData(vars, { testMode: false });

/** Whether R2 holds the account's key. */
const hasKey = async (userId: string) =>
  (await env.USER_KEYS.head(accountKeyPath(userId))) !== null;

/** Every account key in the bucket: whose, its text and its wrapping key. */
async function storedKeys() {
  const listed = await env.USER_KEYS.list({
    prefix: "keys/",
    include: ["customMetadata"],
  });
  return Promise.all(
    listed.objects.map(async (o) => ({
      path: o.key,
      wrapped: (await (await env.USER_KEYS.get(o.key))?.text()) ?? "",
      masterKeyId: o.customMetadata?.masterKeyId,
    })),
  );
}

beforeEach(async () => {
  await env.DB.batch(
    [
      "sync_docs",
      "sync_heads",
      "todo_done",
      "todo_tasks",
      "user_keys",
      "chat_members",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  const listed = await env.USER_KEYS.list();
  if (listed.objects.length > 0)
    await env.USER_KEYS.delete(listed.objects.map((o) => o.key));
});

async function signIn(
  userId: string,
  apiEnv: () => ApiEnv = k1Env,
  origin = ORIGIN,
) {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, now());
  const cookie = (await startSession(env.DB, userId, now())).split(";")[0];
  const request = (path: string, body: unknown) =>
    handleApi(
      new Request(`${origin}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
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

  it("makes the account's key on its first save, wrapped by USER_DATA_KEY, in R2", async () => {
    const phone = await signIn("tstudent");
    expect(await keyed(k1Env()).accountKey("tstudent")).toBeNull();
    // A deletion alone stores no body, so it needs no key.
    await phone.push({ kind: "plan", id: plan.id, baseRev: 0, body: null });
    expect(await keyed(k1Env()).accountKey("tstudent")).toBeNull();
    await phone.push(savePlan());
    expect(await storedKeys()).toEqual([
      {
        path: "keys/tstudent",
        wrapped: expect.stringMatching(/^v1\.k1\.[A-Za-z0-9_-]{16}\./),
        masterKeyId: "k1",
      },
    ]);
    // Nothing of the key is in D1.
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM user_keys").first("n"),
    ).toBe(0);
  });

  it("reads the bucket once per request, however many bodies it opens", async () => {
    const phone = await signIn("tstudent");
    await phone.push(
      savePlan(),
      savePlan(aPlan({ id: "plan_secret_2" })),
      savePlan(aPlan({ id: "plan_secret_3" })),
    );
    let reads = 0;
    const counted = k1Env();
    counted.USER_KEYS = {
      get: (key: string) => {
        reads += 1;
        return env.USER_KEYS.get(key);
      },
    } as unknown as R2Bucket;
    const data = keyed(counted);
    const page = await pullDocs(data, "tstudent", 0);
    expect(page.status === "ok" && page.docs).toHaveLength(3);
    await livePlans(data, "tstudent", [plan.termId]);
    expect(reads).toBe(1);
  });

  it("makes one key when two first saves race", async () => {
    const [a, b] = await Promise.all([signIn("tstudent"), signIn("tstudent")]);
    await Promise.all([
      a?.push(savePlan(aPlan({ id: "plan_race_a" }))),
      b?.push(savePlan(aPlan({ id: "plan_race_b" }))),
    ]);
    const page = await a?.pull(0);
    expect(page?.status === "ok" && page.docs).toHaveLength(2);
    expect(await storedKeys()).toHaveLength(1);
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
    await expect(pullDocs(keyed(k1Env()), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    // Into another account's row with the same doc id: the account is.
    await env.DB.prepare(
      "UPDATE sync_docs SET body = ?1 WHERE user_id = 'tadmin' AND doc_id = ?2",
    )
      .bind(secret.body, plan.id)
      .run();
    await expect(pullDocs(keyed(k1Env()), "tadmin", 0)).rejects.toThrow(
      SealedDataError,
    );
    await expect(
      livePlans(keyed(k1Env()), "tadmin", [plan.termId]),
    ).rejects.toThrow(SealedDataError);
    // Into the same person's row of another kind, with the same doc id:
    // the kind is bound too.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sync_docs"),
      env.DB.prepare(
        `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
         VALUES ('tstudent', 'four-year', ?1, NULL, 1000, 0, ?2, ?3)`,
      ).bind(plan.id, secret.body, now().toISOString()),
    ]);
    await expect(pullDocs(keyed(k1Env()), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
  });

  it("makes one key when a first save lands between another's read and write", async () => {
    await signIn("tstudent");
    // Another first save, run to the end right after this one's read.
    let raced = false;
    let first: string | undefined;
    const racing: UserDataEnv = {
      ...k1Env(),
      USER_KEYS: {
        async get(key: string) {
          const object = await env.USER_KEYS.get(key);
          if (!raced) {
            raced = true;
            await keyed(k1Env()).accountKey("tstudent", { create: true });
            first = (await storedKeys())[0]?.wrapped;
          }
          return object;
        },
        put: (...args: Parameters<R2Bucket["put"]>) =>
          env.USER_KEYS.put(...args),
      } as unknown as R2Bucket,
    };
    const mine = await keyed(racing).accountKey("tstudent", { create: true });
    expect(raced).toBe(true);
    // One key, the first save's: this one's never replaced it.
    expect(await storedKeys()).toEqual([
      expect.objectContaining({ wrapped: first }),
    ]);
    // Both ended up with the one stored key: what one seals, the other opens.
    if (!mine) throw new Error("no key");
    const sealed = await sealForAccount(mine, ["sync-doc", "plan", "p"], "x");
    const theirs = await keyed(k1Env()).accountKey("tstudent");
    if (!theirs) throw new Error("no stored key");
    expect(
      await openForAccount(theirs, ["sync-doc", "plan", "p"], sealed),
    ).toBe("x");
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
    expect(await pullDocs(keyed(during), "tstudent", 0)).toMatchObject({
      docs: [{ body: plan }],
    });
    // Without the previous key the account's key won't unwrap yet.
    const after = withKeys({ USER_DATA_KEY: K2, USER_DATA_KEY_ID: "k2" });
    await expect(pullDocs(keyed(after), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    await runDailyJob({ env: during, now: now() });
    expect(await storedKeys()).toEqual([
      {
        path: "keys/tstudent",
        wrapped: expect.stringMatching(/^v1\.k2\./),
        masterKeyId: "k2",
      },
    ]);
    expect(await rewrapAccountKeys(during)).toEqual({
      moved: 0,
      left: 0,
      stuck: 0,
    });
    expect(await pullDocs(keyed(after), "tstudent", 0)).toMatchObject({
      docs: [{ body: plan }],
    });
  });

  it("counts the account keys a rotation hasn't moved, and those it can't", async () => {
    await (await signIn("tstudent")).push(savePlan());
    await (await signIn("tadmin")).push(savePlan());
    // tadmin's names a key that's in neither var: it can't be moved.
    const admin = await env.USER_KEYS.get(accountKeyPath("tadmin"));
    await env.USER_KEYS.put(
      accountKeyPath("tadmin"),
      (await admin?.text())?.replace(/^v1\.k1\./, "v1.k0.") ?? "",
      { customMetadata: { masterKeyId: "k0" } },
    );
    const during = withKeys({
      USER_DATA_KEY: K2,
      USER_DATA_KEY_ID: "k2",
      USER_DATA_KEY_PREVIOUS: K1,
      USER_DATA_KEY_PREVIOUS_ID: "k1",
    });
    expect(await rewrapAccountKeys(during, 0)).toEqual({
      moved: 0,
      left: 1,
      stuck: 1,
    });
    expect(await rewrapAccountKeys(during)).toEqual({
      moved: 1,
      left: 0,
      stuck: 1,
    });
    // An object whose name isn't an account's is counted, never opened.
    await env.USER_KEYS.put("keys/Not_An_Account", "v1.k1.x.y", {
      customMetadata: { masterKeyId: "k1" },
    });
    expect(await rewrapAccountKeys(during)).toEqual({
      moved: 0,
      left: 0,
      stuck: 2,
    });
    await env.USER_KEYS.delete("keys/Not_An_Account");
    // With no previous key there's nothing to move.
    expect(
      await rewrapAccountKeys(
        withKeys({ USER_DATA_KEY: K2, USER_DATA_KEY_ID: "k2" }),
      ),
    ).toEqual({ moved: 0, left: 0, stuck: 1 });
  });
  it("never puts back a key the purge deleted while it was rewrapping", async () => {
    await (await signIn("tstudent")).push(savePlan());
    const during = withKeys({
      USER_DATA_KEY: K2,
      USER_DATA_KEY_ID: "k2",
      USER_DATA_KEY_PREVIOUS: K1,
      USER_DATA_KEY_PREVIOUS_ID: "k1",
    });
    // The account's key goes between the rewrap's read and its write.
    during.USER_KEYS = {
      list: (...args: Parameters<R2Bucket["list"]>) =>
        env.USER_KEYS.list(...args),
      async get(key: string) {
        const object = await env.USER_KEYS.get(key);
        await env.USER_KEYS.delete(key);
        return object;
      },
      put: (...args: Parameters<R2Bucket["put"]>) => env.USER_KEYS.put(...args),
      head: (key: string) => env.USER_KEYS.head(key),
    } as unknown as R2Bucket;
    // Gone, so neither moved nor left.
    expect(await rewrapAccountKeys(during)).toEqual({
      moved: 0,
      left: 0,
      stuck: 0,
    });
    expect(await storedKeys()).toEqual([]);
  });

  it("can't read a deleted account's docs, even with every D1 row put back", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    const [kept] = await storedBodies();
    if (!kept) throw new Error("no stored plan");
    await markDeleting(env.DB, "tstudent", now());
    await runDailyJob({
      env: k1Env(),
      now: new Date(now().getTime() + 7 * DAY),
    });
    expect(await storedKeys()).toEqual([]);
    expect(await hasKey("tstudent")).toBe(false);

    // The row comes back (as from a copy of the table), the key doesn't.
    await signIn("tstudent");
    const putBack = env.DB.prepare(
      `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
       VALUES ('tstudent', 'plan', ?1, ?2, 1000, 0, ?3, ?4)`,
    ).bind(plan.id, plan.termId, kept.body, now().toISOString());
    await putBack.run();
    // Nothing can open it: it's deleted on sight, unread, and the device
    // starts over.
    expect(await pullDocs(keyed(k1Env()), "tstudent", 0)).toEqual({
      status: "reset",
    });
    expect(await storedBodies()).toEqual([]);

    // Signing up again makes a new key, which doesn't open the old body.
    await (await signIn("tstudent")).push(
      savePlan(aPlan({ id: "plan_new_1" })),
    );
    await putBack.run();
    await expect(
      openedBodyFor(k1Env(), "tstudent", "plan", plan.id, kept.body),
    ).rejects.toThrow(SealedDataError);
    await expect(pullDocs(keyed(k1Env()), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
  });

  it("fails closed without the USER_KEYS bucket: nothing stored, nothing read", async () => {
    const working = await signIn("tstudent");
    await working.push(savePlan());
    const before = await storedBodies();
    const unbound = () => {
      const { USER_KEYS: _bucket, ...rest } = k1Env();
      return rest as ApiEnv & Env;
    };
    const missing = await signIn("tstudent", unbound);
    for (const [path, body] of [
      ["/api/sync/push", { docs: [savePlan(aPlan({ id: "plan_plain" }))] }],
      ["/api/sync/pull", { since: 0 }],
    ] as const) {
      const response = await missing.request(path, body);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "unavailable" });
    }
    expect(await storedBodies()).toEqual(before);
    await expect(
      userDataForJob(unbound()).accountKey("tadmin", { create: true }),
    ).rejects.toThrow("USER_KEYS");
    await expect(rewrapAccountKeys(unbound())).rejects.toThrow(
      UserDataKeyMissing,
    );
    await expect(moveLegacyAccountKeys(unbound())).rejects.toThrow(
      UserDataKeyMissing,
    );
    // The purge stops before deleting anything, rather than leave the key.
    await markDeleting(env.DB, "tstudent", now());
    await expect(
      purgeKey(unbound(), "tstudent", new Date(now().getTime() + 7 * DAY)),
    ).rejects.toThrow(UserDataKeyMissing);
    expect(await storedBodies()).toEqual(before);
    expect(await hasKey("tstudent")).toBe(true);
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
        keyed(withKeys({ USER_DATA_KEY: "c2hvcnQ", USER_DATA_KEY_ID: "k1" })),
        "tstudent",
        [savePlan(aPlan({ id: "plan_plain" }))],
        now(),
      ),
    ).rejects.toThrow("USER_DATA_KEY");
  });

  const masterKeyId = async () => (await storedKeys())[0]?.masterKeyId ?? null;

  it("uses the fixed test key in test mode, on localhost", async () => {
    const testMode = () => withKeys({ AUTH_TEST_MODE: "true" });
    const local = await signIn("tstudent", testMode, LOCALHOST);
    expect((await local.push(savePlan())).results[0]?.status).toBe("ok");
    expect(await masterKeyId()).toBe(TEST_USER_DATA_KEY.id);
    expect(await local.pull(0)).toMatchObject({ docs: [{ body: plan }] });
  });

  const both = () =>
    withKeys({
      USER_DATA_KEY: K1,
      USER_DATA_KEY_ID: "k1",
      AUTH_TEST_MODE: "true",
    });

  it("uses the test key in test mode even with USER_DATA_KEY set: a preview never touches the secret", async () => {
    const preview = await signIn("tstudent", both, PREVIEW);
    expect((await preview.push(savePlan())).results[0]?.status).toBe("ok");
    expect(await masterKeyId()).toBe(TEST_USER_DATA_KEY.id);
    expect(await preview.pull(0)).toMatchObject({ docs: [{ body: plan }] });
    // The secret doesn't open what the test key wrapped.
    await expect(keyed(k1Env()).accountKey("tstudent")).rejects.toThrow(
      SealedDataError,
    );
  });

  it("uses the secret on terpsicle.com whatever the test flag says", async () => {
    const production = await signIn("tstudent", both);
    expect((await production.push(savePlan())).results[0]?.status).toBe("ok");
    expect(await masterKeyId()).toBe("k1");
    expect(await (await signIn("tstudent")).pull(0)).toMatchObject({
      docs: [{ body: plan }],
    });
  });

  it("gives a cron or the chat object the test key only with the flag and no secret", async () => {
    await signIn("tstudent");
    const made = async (vars: Record<string, string>) => {
      await env.USER_KEYS.delete(accountKeyPath("tstudent"));
      await userDataForJob(withKeys(vars)).accountKey("tstudent", {
        create: true,
      });
      return masterKeyId();
    };
    // With no host to check, a secret that's set means production.
    expect(
      await made({
        USER_DATA_KEY: K1,
        USER_DATA_KEY_ID: "k1",
        AUTH_TEST_MODE: "true",
      }),
    ).toBe("k1");
    expect(await made({ AUTH_TEST_MODE: "true" })).toBe(TEST_USER_DATA_KEY.id);
    await expect(made({})).rejects.toThrow(UserDataKeyMissing);
  });

  it("fails closed on terpsicle.com with the test flag and no secret", async () => {
    const flagged = await signIn("tstudent", () =>
      withKeys({ AUTH_TEST_MODE: "true" }),
    );
    const refused = async (path: string, body: unknown) => {
      const response = await flagged.request(path, body);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "unavailable" });
    };
    await refused("/api/sync/push", { docs: [savePlan()] });
    expect(await storedBodies()).toEqual([]);
    expect(await masterKeyId()).toBeNull();
    // Nor does it read with the test key what the secret sealed.
    await (await signIn("tstudent")).push(savePlan());
    await refused("/api/sync/pull", { since: 0 });
  });
});

describe("plain rows written between the migration and the deploy", () => {
  /** What the Worker from before 0025 saved: the next rev, in plain text. */
  const savePlain = (docId: string, kind: string, body: unknown) =>
    env.DB.batch([
      env.DB.prepare(
        "UPDATE sync_heads SET head = head + 1 WHERE user_id = 'tstudent'",
      ),
      env.DB.prepare(
        `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
         SELECT 'tstudent', ?1, ?2, ?3, head, 0, ?4, ?5 FROM sync_heads WHERE user_id = 'tstudent'`,
      ).bind(
        kind,
        docId,
        kind === "plan" ? plan.termId : null,
        JSON.stringify(body),
        now().toISOString(),
      ),
    ]);

  it("deletes them on sight and tells every device to start over", async () => {
    const phone = await signIn("tstudent");
    const laptop = await signIn("tstudent");
    await phone.push(savePlan()); // rev 1, sealed
    expect(await laptop.pull(0)).toMatchObject({ status: "ok", cursor: 1 });
    const plain = aPlan({ id: "plan_plain_1", name: "Typed during deploy" });
    await savePlain(plain.id, "plan", plain);
    await savePlain("settings", "settings", aSettingsDoc());

    // Nothing throws: the plain rows go, and the cursor can't be continued.
    expect(await laptop.pull(1)).toEqual({ status: "reset" });
    const rows = await storedBodies();
    expect(rows.map((r) => r.doc_id)).toEqual([plan.id]);
    expect(JSON.stringify(rows)).not.toContain("Typed during deploy");
    // A device behind them is told to start over too, and from 0 gets
    // what's sealed; its merge puts back what it has.
    expect(await phone.pull(1)).toEqual({ status: "reset" });
    expect(await phone.pull(0)).toMatchObject({
      status: "ok",
      docs: [{ id: plan.id, body: plan }],
    });
  });

  it("leaves them out of Chat's and the calendar's reads, and deletes them", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    await savePlain("plan_plain_1", "plan", aPlan({ id: "plan_plain_1" }));
    expect(
      (await livePlans(keyed(k1Env()), "tstudent", [plan.termId])).map(
        (p) => p.id,
      ),
    ).toEqual([plan.id]);
    expect((await storedBodies()).map((r) => r.doc_id)).toEqual([plan.id]);
    expect(await phone.pull(1)).toEqual({ status: "reset" });
  });

  it("answers a push's conflict over one with nothing stored, and deletes it", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    await savePlain("plan_plain_1", "plan", aPlan({ id: "plan_plain_1" }));
    const answer = await phone.push(
      savePlan(aPlan({ id: "plan_plain_1", name: "Mine" }), 1),
    );
    expect(answer.results[0]).toMatchObject({ status: "conflict", doc: null });
    expect((await storedBodies()).map((r) => r.doc_id)).toEqual([plan.id]);
  });

  it("is swept by the daily job when nothing has read them", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    await savePlain("plan_plain_1", "plan", aPlan({ id: "plan_plain_1" }));
    await runDailyJob({ env: k1Env(), now: now() });
    expect((await storedBodies()).map((r) => r.doc_id)).toEqual([plan.id]);
    expect(await phone.pull(1)).toEqual({ status: "reset" });
  });
});

describe("migration 0025: plain rows cleared", () => {
  const clearing = () =>
    (
      testBindings().migrations.find((m) => m.name.startsWith("0025_"))
        ?.queries ?? []
    ).filter((q) => !q.includes("CREATE TABLE"));
  const runClearing = () =>
    env.DB.batch(clearing().map((q) => env.DB.prepare(q)));

  it("answers a device that synced before it with a reset, then takes its docs again", async () => {
    expect(clearing()).toHaveLength(4);
    const phone = await signIn("tstudent");
    await phone.push(savePlan(), savePlan(aPlan({ id: "plan_second" }))); // revs 1–2
    expect(await phone.pull(0)).toMatchObject({ status: "ok", cursor: 2 });

    await runClearing();
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

  it("resets a device even after another one has uploaded and edited past its cursor", async () => {
    const phone = await signIn("tstudent");
    const laptop = await signIn("tstudent");
    const plans = [1, 2, 3, 4, 5].map((n) =>
      aPlan({ id: `plan_before_${n}`, name: `Plan ${n}` }),
    );
    await phone.push(...plans.map((p) => savePlan(p))); // revs 1–5
    expect(await laptop.pull(0)).toMatchObject({ status: "ok", cursor: 5 });

    await runClearing();

    // The phone comes back first: it starts over, uploads its five plans
    // again and edits two, all before the laptop pulls.
    expect(await phone.pull(5)).toEqual({ status: "reset" });
    const again = await phone.push(...plans.map((p) => savePlan(p)));
    const revs = again.results.map((r) => (r.status === "ok" ? r.rev : 0));
    await phone.push(
      ...plans
        .slice(0, 2)
        .map((p, i) => savePlan({ ...p, name: `${p.name} again` }, revs[i])),
    );

    // The laptop's cursor is behind the new head now, but it must still
    // start over: a page from 5 would skip what was uploaded again.
    expect(await laptop.pull(5)).toEqual({ status: "reset" });
    const all = await laptop.pull(0);
    expect(all.status === "ok" && all.docs.map((d) => d.id).sort()).toEqual(
      plans.map((p) => p.id).sort(),
    );
  });
});

describe("keys kept in D1 before they moved to R2", () => {
  /** Moves the account's key back into `user_keys`, as an older build kept it. */
  async function keepInD1(userId: string) {
    const path = accountKeyPath(userId);
    const wrapped = (await (await env.USER_KEYS.get(path))?.text()) ?? "";
    await env.USER_KEYS.delete(path);
    await env.DB.prepare(
      "INSERT INTO user_keys (user_id, wrapped_key, master_key_id) VALUES (?1, ?2, 'k1')",
    )
      .bind(userId, wrapped)
      .run();
    return wrapped;
  }
  const legacyRows = () =>
    env.DB.prepare("SELECT count(*) AS n FROM user_keys").first("n");

  it("moves one the first time it's needed, and its docs still open", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    const wrapped = await keepInD1("tstudent");
    expect(await phone.pull(0)).toMatchObject({ docs: [{ body: plan }] });
    expect(await storedKeys()).toEqual([
      { path: "keys/tstudent", wrapped, masterKeyId: "k1" },
    ]);
    expect(await legacyRows()).toBe(0);
  });

  it("moves the rest in the daily job", async () => {
    await (await signIn("tstudent")).push(savePlan());
    await (await signIn("tadmin")).push(savePlan());
    await keepInD1("tstudent");
    await keepInD1("tadmin");
    expect(await moveLegacyAccountKeys(k1Env(), 1)).toEqual({
      moved: 1,
      left: 1,
    });
    expect(await moveLegacyAccountKeys(k1Env())).toEqual({
      moved: 1,
      left: 0,
    });
    expect((await storedKeys()).map((k) => k.path)).toEqual([
      "keys/tadmin",
      "keys/tstudent",
    ]);
    expect(await pullDocs(keyed(k1Env()), "tadmin", 0)).toMatchObject({
      status: "ok",
    });
  });

  it("keeps the bucket's key, and the row, when they differ", async () => {
    await (await signIn("tstudent")).push(savePlan());
    const inBucket = (await storedKeys())[0]?.wrapped;
    await env.DB.prepare(
      "INSERT INTO user_keys (user_id, wrapped_key, master_key_id) VALUES ('tstudent', 'v1.k1.other', 'k1')",
    ).run();
    expect(await moveLegacyAccountKeys(k1Env())).toEqual({
      moved: 0,
      left: 1,
    });
    expect((await storedKeys())[0]?.wrapped).toBe(inBucket);
  });

  it("never brings back a key the purge deleted while it was moving it", async () => {
    await (await signIn("tstudent")).push(savePlan());
    await keepInD1("tstudent");
    await markDeleting(env.DB, "tstudent", now());
    // The purge's step 2 lands right after the move stores the key.
    const racing = k1Env();
    racing.USER_KEYS = {
      async put(...args: Parameters<R2Bucket["put"]>) {
        const put = await env.USER_KEYS.put(...args);
        await purgeKey(
          k1Env(),
          "tstudent",
          new Date(now().getTime() + 7 * DAY),
        );
        return put;
      },
      get: (key: string) => env.USER_KEYS.get(key),
      delete: (key: string) => env.USER_KEYS.delete(key),
    } as unknown as R2Bucket;
    expect(await moveLegacyAccountKeys(racing)).toEqual({ moved: 0, left: 0 });
    expect(await storedKeys()).toEqual([]);
  });

  it("is deleted by the purge with the rest", async () => {
    await (await signIn("tstudent")).push(savePlan());
    await keepInD1("tstudent");
    await markDeleting(env.DB, "tstudent", now());
    expect(
      await purgeKey(k1Env(), "tstudent", new Date(now().getTime() + 7 * DAY)),
    ).toBe(true);
    expect(await legacyRows()).toBe(0);
    expect(await storedKeys()).toEqual([]);
  });
});

describe("the purge and the account's key", () => {
  const due = () => new Date(now().getTime() + 7 * DAY);

  it("deletes what the key sealed before the key, and only while the account is due", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    // Not deleting: nothing goes.
    expect(await purgeKey(k1Env(), "tstudent", due())).toBe(false);
    expect(await storedKeys()).toHaveLength(1);
    expect(await storedBodies()).toHaveLength(1);

    await markDeleting(env.DB, "tstudent", now());
    // The bucket refuses the delete: the rows are gone, the account is
    // still due, and the next run deletes the key.
    const refusing = k1Env();
    refusing.USER_KEYS = {
      delete: () => Promise.reject(new Error("R2 is down")),
    } as unknown as R2Bucket;
    await expect(purgeKey(refusing, "tstudent", due())).rejects.toThrow(
      "R2 is down",
    );
    expect(await storedBodies()).toEqual([]);
    expect(await storedKeys()).toHaveLength(1);
    expect(await purgeKey(k1Env(), "tstudent", due())).toBe(true);
    expect(await storedKeys()).toEqual([]);
  });

  it("leaves someone who signs in just after it a working account that starts over", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    await markDeleting(env.DB, "tstudent", now());
    expect(await purgeKey(k1Env(), "tstudent", due())).toBe(true);

    // They sign in before the rest of the purge: the account stays, with
    // nothing sealed under the key that's gone.
    const back = await signIn("tstudent");
    expect(await back.pull(1)).toEqual({ status: "reset" });
    expect(await back.pull(0)).toMatchObject({ status: "ok", docs: [] });
    expect((await back.push(savePlan())).results[0]?.status).toBe("ok");
    expect(await back.pull(0)).toMatchObject({ docs: [{ body: plan }] });
  });
});

describe("an account revived after the purge deleted its key", () => {
  const due = () => new Date(now().getTime() + 7 * DAY);

  /** Purge step 2 runs, then a sign-in (another device) keeps the account. */
  async function purgeKeyThenRevive() {
    await markDeleting(env.DB, "tstudent", now());
    expect(await purgeKey(k1Env(), "tstudent", due())).toBe(true);
    await signIn("tstudent");
  }

  it("starts every device over, even after another has uploaded and edited past its cursor", async () => {
    const phone = await signIn("tstudent");
    const laptop = await signIn("tstudent");
    const plans = [1, 2, 3, 4, 5].map((n) =>
      aPlan({ id: `plan_revived_${n}`, name: `Plan ${n}` }),
    );
    await phone.push(...plans.map((p) => savePlan(p))); // revs 1–5
    expect(await laptop.pull(0)).toMatchObject({ status: "ok", cursor: 5 });

    await purgeKeyThenRevive();

    // The phone comes back first: it starts over, uploads its five plans
    // again and edits two, all before the laptop pulls.
    expect(await phone.pull(5)).toEqual({ status: "reset" });
    const again = await phone.push(...plans.map((p) => savePlan(p)));
    const revs = again.results.map((r) => (r.status === "ok" ? r.rev : 0));
    await phone.push(
      ...plans
        .slice(0, 2)
        .map((p, i) => savePlan({ ...p, name: `${p.name} again` }, revs[i])),
    );

    // Revs never start over, so the laptop's cursor can't pass for current:
    // a page from 5 would skip what was uploaded again.
    expect(await laptop.pull(5)).toEqual({ status: "reset" });
    const all = await laptop.pull(0);
    expect(all.status === "ok" && all.docs.map((d) => d.id).sort()).toEqual(
      plans.map((p) => p.id).sort(),
    );
  });

  it("deletes rows sealed under the key that's gone, and starts over, rather than failing for good", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    // A push that read the key just before the purge deleted it saved this
    // row under it: the account is kept, the key is gone.
    await env.USER_KEYS.delete(accountKeyPath("tstudent"));

    // Chat's and the calendar's reads leave it out, and delete it.
    expect(await livePlans(keyed(k1Env()), "tstudent", [plan.termId])).toEqual(
      [],
    );
    expect(await storedBodies()).toEqual([]);

    // So does a pull, which starts the device over.
    await phone.push(savePlan(aPlan({ id: "plan_lost_1" })));
    await env.USER_KEYS.delete(accountKeyPath("tstudent"));
    expect(await phone.pull(0)).toEqual({ status: "reset" });
    expect(await storedBodies()).toEqual([]);

    // A push makes a new key, after deleting what the old one sealed.
    await phone.push(savePlan(aPlan({ id: "plan_lost_2" })));
    await env.USER_KEYS.delete(accountKeyPath("tstudent"));
    const saved = await phone.push(savePlan(aPlan({ id: "plan_new_2" })));
    expect(saved.results[0]?.status).toBe("ok");
    expect((await storedBodies()).map((r) => r.doc_id)).toEqual(["plan_new_2"]);
    expect(await phone.pull(1)).toEqual({ status: "reset" });
    expect(await phone.pull(0)).toMatchObject({
      status: "ok",
      docs: [{ id: "plan_new_2" }],
    });
  });

  it("does the same for own tasks", async () => {
    await signIn("tstudent");
    const data = () => keyed(k1Env());
    const task = (uid: string) => ({
      uid,
      title: "Read chapter 4",
      courseCode: null,
      dueAt: null,
      dueDate: null,
    });
    await upsertTask(data(), "tstudent", task("own-lost-task-01"), now(), 500);
    await env.USER_KEYS.delete(accountKeyPath("tstudent"));
    const tasks = () =>
      env.DB.prepare("SELECT uid FROM todo_tasks").all<{ uid: string }>();
    expect(
      await listTasks(data(), "tstudent", null, { undated: true }),
    ).toEqual([]);
    expect((await tasks()).results).toEqual([]);

    await upsertTask(data(), "tstudent", task("own-lost-task-02"), now(), 500);
    await env.USER_KEYS.delete(accountKeyPath("tstudent"));
    await upsertTask(data(), "tstudent", task("own-new-task-01"), now(), 500);
    expect((await tasks()).results).toEqual([{ uid: "own-new-task-01" }]);
    expect(
      await listTasks(data(), "tstudent", null, { undated: true }),
    ).toMatchObject([{ title: "Read chapter 4" }]);
  });

  it("still fails, deleting nothing, when the key is there and a row won't open", async () => {
    const phone = await signIn("tstudent");
    await phone.push(savePlan());
    const [row] = await storedBodies();
    await env.DB.prepare(
      "UPDATE sync_docs SET body = ?1 WHERE user_id = 'tstudent'",
    )
      .bind(`${row?.body.slice(0, -4)}AAAA`)
      .run();
    await expect(pullDocs(keyed(k1Env()), "tstudent", 0)).rejects.toThrow(
      SealedDataError,
    );
    expect(await storedBodies()).toHaveLength(1);
  });
});
