// The device engine's tests (src/features/sync/engine.test.ts) run against
// FakeSyncServer, a server in memory. This runs the same sequences of pushes
// and pulls, from several devices, against the real routes and D1 and against
// the fake, and checks every answer matches, so the engine is tested against
// what the Worker really does.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findTestUser } from "~/core/auth";
import {
  type Plan,
  type SyncPullResult,
  SyncPullResultSchema,
  type SyncPushDoc,
  type SyncPushResult,
  SyncPushResultSchema,
} from "~/core/schema";
import {
  aBlock,
  aPlan,
  aSavedCourse,
  aSettingsDoc,
  FakeSyncServer,
  randomInt,
  seededRandom,
} from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { upsertUser } from "../auth/store";

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

/** Both servers, asked the same thing in the same order. */
class Pair {
  readonly fake = new FakeSyncServer(() => now().toISOString());
  private cookie = "";

  async signIn(): Promise<void> {
    const user = findTestUser("tstudent");
    if (!user) throw new Error("no test user");
    await upsertUser(env.DB, user.identity, now());
    const setCookie = await startSession(env.DB, "tstudent", now());
    this.cookie = setCookie.split(";")[0] ?? "";
  }

  private async call(path: string, body: unknown): Promise<unknown> {
    const response = await handleApi(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: this.cookie,
        },
      }),
      env as ApiEnv,
      { waitUntil: () => {} },
      now(),
    );
    expect(response.status).toBe(200);
    // Sessions refresh with a new token once a day (docs/AUTH.md).
    const refreshed = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Host-session="));
    if (refreshed) this.cookie = refreshed.split(";")[0] ?? this.cookie;
    return response.json();
  }

  async push(docs: SyncPushDoc[]): Promise<SyncPushResult> {
    const real = SyncPushResultSchema.parse(
      await this.call("/api/sync/push", { docs }),
    );
    expect(this.fake.push(structuredClone({ docs }))).toEqual(real);
    return real;
  }

  async pull(since: number): Promise<SyncPullResult> {
    const real = SyncPullResultSchema.parse(
      await this.call("/api/sync/pull", { since }),
    );
    expect(this.fake.pull({ since })).toEqual(real);
    return real;
  }

  async prune(): Promise<void> {
    await runDailyJob({ env: env as Env, now: now() });
    this.fake.prune(now().toISOString());
    // The session aged past its lifetime meanwhile.
    await this.signIn();
  }
}

/** What one device believes: the rev it last saw of each doc, and its cursor. */
interface DeviceView {
  revs: Map<string, number>;
  cursor: number;
}

const PLAN_IDS = ["plan_0001_fake", "plan_0002_fake", "plan_0003_fake"];

describe("FakeSyncServer", () => {
  it("answers scripted pushes and pulls exactly as the Worker does", async () => {
    const pair = new Pair();
    await pair.signIn();
    const plan = aPlan({ id: PLAN_IDS[0] });
    await pair.push([
      { kind: "plan", id: plan.id, baseRev: 0, body: plan },
      { kind: "settings", id: "settings", baseRev: 0, body: aSettingsDoc() },
    ]);
    // A stale base and a new doc in one push, then a delete.
    await pair.push([
      { kind: "plan", id: plan.id, baseRev: 0, body: plan },
      {
        kind: "plan",
        id: PLAN_IDS[1] ?? "",
        baseRev: 0,
        body: aPlan({ id: PLAN_IDS[1] }),
      },
    ]);
    await pair.push([{ kind: "plan", id: plan.id, baseRev: 1, body: null }]);
    await pair.pull(0);
    await pair.pull(2);
    // A tombstone pruned, then a device from before it: reset.
    clock += 31 * DAY;
    await pair.prune();
    await pair.pull(1);
    await pair.pull(0);
    // Saving on a pruned tombstone's rev is a conflict with no doc.
    await pair.push([{ kind: "plan", id: plan.id, baseRev: 3, body: plan }]);
    await pair.push([{ kind: "plan", id: plan.id, baseRev: 0, body: plan }]);
    // Ahead of the account: reset.
    await pair.pull(99);
  });

  it("stays alike through random pushes and pulls from three devices", async () => {
    const pair = new Pair();
    await pair.signIn();
    const rand = seededRandom("fake-sync-server");
    const devices: DeviceView[] = [0, 1, 2].map(() => ({
      revs: new Map(),
      cursor: 0,
    }));
    const pick = <T>(items: readonly T[]): T => {
      const item = items[randomInt(rand, 0, items.length - 1)];
      if (item === undefined) throw new Error("empty");
      return item;
    };
    for (let step = 0; step < 60; step++) {
      const device = pick(devices);
      if (rand() < 0.4) {
        const page = await pair.pull(device.cursor);
        if (page.status === "ok") {
          for (const doc of page.docs)
            device.revs.set(`${doc.kind}:${doc.id}`, doc.rev);
          device.cursor = page.cursor;
        } else device.cursor = 0;
        continue;
      }
      const ids = [...new Set([pick(PLAN_IDS), pick(PLAN_IDS)])];
      const docs: SyncPushDoc[] = ids.map((id) => {
        const body: Plan | null =
          rand() < 0.2
            ? null
            : aPlan({
                id,
                name: `Plan ${step}`,
                courses: [aSavedCourse(pick(["MATH140", "ENGL101"]))],
              });
        return {
          kind: "plan",
          id,
          baseRev: device.revs.get(`plan:${id}`) ?? 0,
          body,
        };
      });
      if (rand() < 0.3)
        docs.push({
          kind: "settings",
          id: "settings",
          baseRev: device.revs.get("settings:settings") ?? 0,
          body: aSettingsDoc({ blocks: [aBlock({ label: `Step ${step}` })] }),
        });
      const { results } = await pair.push(docs);
      for (const result of results) {
        const key = `${result.kind}:${result.id}`;
        if (result.status === "ok") device.revs.set(key, result.rev);
        else if (result.status === "conflict")
          device.revs.set(key, result.doc?.rev ?? 0);
      }
      clock += randomInt(rand, 1, 4) * DAY;
      if (step % 20 === 19) await pair.prune();
    }
  });
});
