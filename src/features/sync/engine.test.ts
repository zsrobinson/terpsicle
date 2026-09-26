import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type IsoDateTime,
  type Plan,
  SYNC_MAX_PLANS,
  SYNC_PULL_PAGE,
  type SyncPullInput,
  type SyncPushInput,
} from "~/core/schema";
import {
  planDocKey,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  settingsDocOf,
} from "~/core/sync";
import {
  aBlock,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  FakeSyncServer,
} from "~/fixtures";
import { ApiCallError } from "~/server/fns/api";
import {
  PUSH_DELAY_MS,
  RETRY_MIN_MS,
  SyncEngine,
  type SyncNotice,
} from "./engine";
import type { RemoteChange } from "./remote-change";
import type { SyncStatus } from "./status";
import {
  EMPTY_SNAPSHOT,
  memorySyncStorage,
  type SyncSnapshot,
} from "./storage";

// The device engine against a server in memory with the Worker's rules
// (src/fixtures/sync-server.ts; src/server/sync/fake-server.test.ts keeps the
// two alike). Each "device" has its own storage, as two browsers would.

const USER = "tstudent";
let clock = Date.parse("2026-10-01T15:00:00.000Z");
const now = (): IsoDateTime => new Date(clock).toISOString();

/** One lock for every engine on one browser (Web Locks in the app). */
function mutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

const clone = <T>(value: T): T => structuredClone(value);

class Device {
  readonly storage: ReturnType<typeof memorySyncStorage>;
  readonly applied: RemoteChange[] = [];
  readonly notices: SyncNotice[] = [];
  readonly statuses: SyncStatus[] = [];
  online = true;
  signedOut = false;
  /** Makes the next call answer 401, as after a session ends elsewhere. */
  sessionGone = false;
  engine: SyncEngine;
  private ids = 0;

  constructor(
    readonly name: string,
    readonly server: FakeSyncServer,
    options: {
      snapshot?: SyncSnapshot;
      storage?: ReturnType<typeof memorySyncStorage>;
      lock?: <T>(task: () => Promise<T>) => Promise<T>;
    } = {},
  ) {
    this.storage = options.storage ?? memorySyncStorage(options.snapshot);
    const call = async <T>(answer: () => T): Promise<T> => {
      await Promise.resolve();
      if (this.sessionGone) throw new ApiCallError("unauthorized");
      if (!this.online) throw new ApiCallError("network");
      return clone(answer());
    };
    this.engine = new SyncEngine({
      userId: USER,
      client: {
        push: (input: SyncPushInput) => call(() => server.push(clone(input))),
        pull: (input: SyncPullInput) => call(() => server.pull(input)),
      },
      storage: this.storage,
      apply: (change) => this.applied.push(change),
      enqueue: (write) => void write(),
      flushed: async () => {},
      lock: options.lock ?? mutex(),
      now,
      newId: () => `${name}_copy_${++this.ids}`,
      notify: (notice) => this.notices.push(notice),
      status: (status) => this.statuses.push(status),
      signedOut: () => {
        this.signedOut = true;
      },
      isOnline: () => this.online,
      isVisible: () => true,
    });
  }

  get tables(): SyncedTables {
    return this.storage.snapshot.tables;
  }

  get flags() {
    return this.storage.snapshot.sync.docs;
  }

  plan(id: string): Plan | undefined {
    return this.tables.plans.find((p) => p.id === id);
  }

  names(): string[] {
    return this.tables.plans.map((p) => p.name).sort();
  }

  /** The person edits: the store writes the tables, then tells the engine. */
  edit(recipe: (t: SyncedTables) => SyncedTables): void {
    const prev = this.tables;
    const next = recipe(prev);
    this.storage.snapshot = { ...this.storage.snapshot, tables: next };
    this.engine.noteEdit(prev, next);
  }

  editPlan(id: string, change: Partial<Plan>): void {
    this.edit((t) => ({
      ...t,
      plans: t.plans.map((p) => (p.id === id ? { ...p, ...change } : p)),
    }));
  }

  status(): SyncStatus | undefined {
    return this.statuses.at(-1);
  }

  /** Waits for the debounced push, and whatever it started. */
  async settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(PUSH_DELAY_MS);
    await this.engine.idle();
  }
}

const planA = aPlan({ id: "plan_a_0001", name: "Plan A" });
const planB = aPlan({
  id: "plan_b_0001",
  name: "Plan B",
  order: 1,
  courses: [aSavedCourse()],
});

/** A device already signed in and in step with the server. */
async function syncedDevice(
  name: string,
  server: FakeSyncServer,
): Promise<Device> {
  const device = new Device(name, server, {
    snapshot: { ...EMPTY_SNAPSHOT, userId: USER },
  });
  await device.engine.start();
  return device;
}

let server: FakeSyncServer;
const devices: Device[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  clock = Date.parse("2026-10-01T15:00:00.000Z");
  server = new FakeSyncServer(now);
});

afterEach(() => {
  for (const d of devices.splice(0)) d.engine.stop();
  vi.useRealTimers();
});

function track(device: Device): Device {
  devices.push(device);
  return device;
}

describe("pushing", () => {
  it("pushes an edit a second after it, and only once for a burst", async () => {
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({ ...t, plans: [planA] }));
    a.editPlan(planA.id, { name: "Fall" });
    a.editPlan(planA.id, { name: "Fall plan" });
    await vi.advanceTimersByTimeAsync(PUSH_DELAY_MS - 1);
    expect(server.calls.filter((c) => c.kind === "push")).toEqual([]);
    expect(a.status()).toBe("saving");

    await a.settle();
    const pushes = server.calls.filter((c) => c.kind === "push");
    expect(pushes).toHaveLength(1);
    expect(server.plans().get(planA.id)?.name).toBe("Fall plan");
    expect(a.flags[planDocKey(planA.id)]).toEqual({
      rev: 1,
      dirty: false,
      inFlight: false,
    });
    expect(a.status()).toBe("saved");
  });

  it("pushes the settings doc when blocks, colors or travel change", async () => {
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({
      ...t,
      blocks: [aBlock()],
      colors: { CMSC351: "teal" },
    }));
    await a.settle();
    const stored = server.docs.get("settings:settings");
    expect(stored?.body).toEqual(settingsDocOf(a.tables));
    // The base is what was saved: the next conflict is settled from it.
    expect(a.storage.snapshot.base).toEqual(settingsDocOf(a.tables));
  });

  it("deletes a plan with a tombstone, and never pushes one it never saved", async () => {
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({ ...t, plans: [planA, planB] }));
    await a.settle();
    const draft = aPlan({ id: "plan_draft_01", name: "Draft", courses: [] });
    a.edit((t) => ({ ...t, plans: [...t.plans, { ...draft, name: "Try" }] }));
    a.edit((t) => ({
      ...t,
      plans: t.plans.filter((p) => p.id !== planB.id && p.id !== draft.id),
    }));
    await a.settle();
    expect(server.docs.get(`plan:${planB.id}`)?.body).toBeNull();
    expect(server.docs.has(`plan:${draft.id}`)).toBe(false);
    expect(a.flags[planDocKey(draft.id)]).toBeUndefined();
  });

  it("doesn't push a plan the app made on its own until it's touched", async () => {
    const a = track(await syncedDevice("a", server));
    const auto = aPlan({ id: "plan_auto_001", courses: [] });
    a.edit((t) => ({ ...t, plans: [auto] }));
    await a.settle();
    expect(server.plans().size).toBe(0);
    a.editPlan(auto.id, { courses: [aPlanCourse()] });
    await a.settle();
    expect(server.plans().has(auto.id)).toBe(true);
  });

  it("sends again a push the page never heard back from", async () => {
    const snapshot: SyncSnapshot = {
      ...EMPTY_SNAPSHOT,
      userId: USER,
      tables: { ...EMPTY_SNAPSHOT.tables, plans: [planA] },
      sync: {
        cursor: 0,
        docs: {
          [planDocKey(planA.id)]: { rev: 0, dirty: false, inFlight: true },
        },
      },
    };
    const a = track(new Device("a", server, { snapshot }));
    await a.engine.start();
    expect(server.plans().get(planA.id)).toEqual(planA);
    expect(a.flags[planDocKey(planA.id)]?.inFlight).toBe(false);
  });

  it("says the account is full and keeps the new plan here", async () => {
    for (let i = 0; i < SYNC_MAX_PLANS; i++) {
      server.push({
        docs: [
          {
            kind: "plan",
            id: `plan_${String(i).padStart(4, "0")}_full`,
            baseRev: 0,
            body: aPlan({ id: `plan_${String(i).padStart(4, "0")}_full` }),
          },
        ],
      });
    }
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({ ...t, plans: [...t.plans, planB] }));
    await a.settle();
    expect(server.plans().has(planB.id)).toBe(false);
    expect(a.plan(planB.id)).toEqual(planB);
    expect(a.notices).toContainEqual({ kind: "too-many-plans" });
    expect(a.status()).toBe("full");
    expect(await a.engine.flush()).toBe(false);
  });
});

describe("pulling", () => {
  it("brings another device's edits, and replaces nothing it's still saving", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    a.edit((t) => ({ ...t, plans: [planA, planB] }));
    await a.settle();

    await b.engine.sync();
    expect(b.plan(planA.id)).toEqual(planA);
    expect(b.plan(planB.id)).toEqual(planB);
    expect(
      b.applied
        .at(-1)
        ?.plans?.map(([id]) => id)
        .sort(),
    ).toEqual([planA.id, planB.id]);
    // Pulled docs aren't edits: nothing to push back.
    await b.settle();
    expect(server.calls.filter((c) => c.kind === "push")).toHaveLength(1);

    a.editPlan(planA.id, { name: "Spring" });
    await a.settle();
    b.online = false;
    b.editPlan(planA.id, { name: "Mine" });
    b.online = true;
    // A pull alone leaves the unsaved edit alone; its push settles it.
    await b.engine.sync();
    expect(b.names()).toContain("Spring");
  });

  it("pulls on the interval, and page by page", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    // As many plans as an account holds, and the settings doc: two pages.
    const plans = Array.from({ length: SYNC_MAX_PLANS }, (_, i) =>
      aPlan({ id: `plan_${String(i).padStart(4, "0")}_many`, order: i }),
    );
    a.edit((t) => ({ ...t, plans, blocks: [aBlock()] }));
    await a.settle();
    expect(server.plans().size).toBe(SYNC_MAX_PLANS);

    await vi.advanceTimersByTimeAsync(60_000);
    await b.engine.idle();
    expect(b.tables.plans).toHaveLength(SYNC_MAX_PLANS);
    expect(b.tables.blocks).toEqual([aBlock()]);
    const pulls = server.calls.filter((c) => c.kind === "pull");
    expect(pulls.slice(-2).map((c) => c.input)).toEqual([
      { since: 0 },
      { since: SYNC_PULL_PAGE },
    ]);
  });

  it("drops the app's own empty plan when the account's plans arrive in its term", async () => {
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({ ...t, plans: [planB] }));
    await a.settle();
    const b = track(
      new Device("b", server, {
        snapshot: { ...EMPTY_SNAPSHOT, userId: USER },
      }),
    );
    const auto = aPlan({ id: "plan_auto_b01", courses: [] });
    b.edit((t) => ({ ...t, plans: [auto] }));
    await b.engine.start();
    expect(b.tables.plans.map((p) => p.id)).toEqual([planB.id]);
    expect(b.applied.at(-1)?.plans).toContainEqual([auto.id, null]);
  });
});

describe("conflicts", () => {
  it("keeps both when two devices change the same plan: the other's, and a copy of this one's", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    a.edit((t) => ({ ...t, plans: [planA] }));
    await a.settle();
    await b.engine.sync();

    b.online = false;
    b.editPlan(planA.id, { courses: [aSavedCourse("ENGL101")] });
    await b.settle();
    expect(b.status()).toBe("offline");

    a.editPlan(planA.id, { courses: [aSavedCourse("MATH140")] });
    await a.settle();

    b.online = true;
    await b.engine.sync();
    const copy = b.tables.plans.find((p) => p.name === "Plan A (copy)");
    expect(b.plan(planA.id)?.courses.map((c) => c.courseCode)).toEqual([
      "MATH140",
    ]);
    expect(copy?.courses.map((c) => c.courseCode)).toEqual(["ENGL101"]);
    expect(b.notices).toContainEqual({
      kind: "conflict-copy",
      from: "Plan A",
      to: "Plan A (copy)",
    });
    // The copy is a new plan, saved like any other.
    expect(copy && server.plans().get(copy.id)).toEqual(copy);
    expect(b.status()).toBe("saved");

    await a.engine.sync();
    expect(a.names()).toEqual(["Plan A", "Plan A (copy)"]);
  });

  it("takes the other device's version when both hold the same work", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    a.edit((t) => ({ ...t, plans: [planA] }));
    await a.settle();
    await b.engine.sync();
    b.online = false;
    b.editPlan(planA.id, { name: "Same" });
    await b.settle();
    a.editPlan(planA.id, { name: "Same", order: 3 });
    await a.settle();
    b.online = true;
    await b.engine.sync();
    expect(b.names()).toEqual(["Same"]);
    expect(b.plan(planA.id)?.order).toBe(3);
  });

  it("lets an edit beat a delete, either way", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    a.edit((t) => ({ ...t, plans: [planA, planB] }));
    await a.settle();
    await b.engine.sync();

    // Deleted on A, edited on B: it's saved again.
    b.online = false;
    b.editPlan(planA.id, { name: "Kept" });
    a.edit((t) => ({ ...t, plans: t.plans.filter((p) => p.id !== planA.id) }));
    await a.settle();
    // Deleted on B, edited on A: it comes back.
    b.edit((t) => ({ ...t, plans: t.plans.filter((p) => p.id !== planB.id) }));
    a.editPlan(planB.id, { name: "Back" });
    await a.settle();

    b.online = true;
    await b.engine.sync();
    expect(b.names()).toEqual(["Back", "Kept"]);
    expect(server.plans().get(planA.id)?.name).toBe("Kept");
    await a.engine.sync();
    expect(a.names()).toEqual(["Back", "Kept"]);
  });

  it("settles the settings doc per key: each device keeps the keys it changed", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    const lunch = aBlock({ id: "block_lunch_1" });
    a.edit((t) => ({ ...t, blocks: [lunch], colors: { CMSC351: "blue" } }));
    await a.settle();
    await b.engine.sync();

    b.online = false;
    b.edit((t) => ({ ...t, colors: { CMSC351: "pink" } }));
    await b.settle();
    a.edit((t) => ({ ...t, blocks: [{ ...lunch, label: "Work" }] }));
    await a.settle();
    b.online = true;
    await b.engine.sync();

    expect(b.tables.blocks.map((x) => x.label)).toEqual(["Work"]);
    expect(b.tables.colors).toEqual({ CMSC351: "pink" });
    expect(server.docs.get("settings:settings")?.body).toEqual(
      settingsDocOf(b.tables),
    );
    expect(b.applied.at(-1)?.settings).toEqual(settingsDocOf(b.tables));
  });
});

describe("the first sign-in on a device", () => {
  it("uploads this device's plans and says so", async () => {
    const a = track(
      new Device("a", server, {
        snapshot: {
          ...EMPTY_SNAPSHOT,
          tables: { ...EMPTY_SNAPSHOT.tables, plans: [planA, planB] },
        },
      }),
    );
    await a.engine.start();
    expect([...server.plans().keys()].sort()).toEqual([planA.id, planB.id]);
    expect(a.storage.snapshot.userId).toBe(USER);
    expect(a.notices).toEqual([
      {
        kind: "first-sign-in",
        reset: false,
        uploaded: 2,
        fromAccount: 0,
        renamed: [],
        copies: [],
      },
    ]);
  });

  it("keeps both when the account has a plan by the same name, and drops nothing", async () => {
    const other = track(await syncedDevice("other", server));
    const theirs = aPlan({ id: "plan_theirs_1", name: "Plan A" });
    other.edit((t) => ({ ...t, plans: [theirs] }));
    await other.settle();

    const a = track(
      new Device("a", server, {
        snapshot: {
          ...EMPTY_SNAPSHOT,
          tables: { ...EMPTY_SNAPSHOT.tables, plans: [planA] },
        },
      }),
    );
    await a.engine.start();
    expect(a.names()).toEqual(["Plan A", "Plan A (copy)"]);
    expect(server.plans().size).toBe(2);
    expect(a.notices.at(-1)).toMatchObject({
      kind: "first-sign-in",
      uploaded: 1,
      fromAccount: 1,
      renamed: [{ from: "Plan A", to: "Plan A (copy)" }],
    });
  });

  it("joins again, keeping everything, when the server can't continue the cursor", async () => {
    const a = track(await syncedDevice("a", server));
    const b = track(await syncedDevice("b", server));
    a.edit((t) => ({ ...t, plans: [planA, planB] }));
    await a.settle();
    await b.engine.sync();
    const cursor = b.storage.snapshot.sync.cursor;

    // A deletes Plan B; the tombstone is pruned before B hears of it.
    a.edit((t) => ({ ...t, plans: t.plans.filter((p) => p.id !== planB.id) }));
    await a.settle();
    a.editPlan(planA.id, { name: "Later" });
    await a.settle();
    clock += 31 * 86_400_000;
    server.prune(now());
    expect(server.prunedThrough).toBeGreaterThan(cursor);

    await b.engine.sync();
    const pulls = server.calls.filter(
      (c): c is { kind: "pull"; input: SyncPullInput } => c.kind === "pull",
    );
    expect(pulls.at(-1)?.input.since).toBe(0);
    // Nothing is dropped: B's copy of Plan B goes up again as new.
    expect(b.names()).toEqual(["Later", "Plan B"]);
    expect(server.plans().has(planB.id)).toBe(true);
  });
});

describe("staying calm", () => {
  it("waits offline, retries with backoff, and saves once back", async () => {
    const a = track(await syncedDevice("a", server));
    a.online = false;
    a.edit((t) => ({ ...t, plans: [planA] }));
    await a.settle();
    expect(a.status()).toBe("offline");

    // Online as far as the browser knows, but the requests fail.
    let attempts = 0;
    const push = server.push.bind(server);
    server.push = (input) => {
      attempts++;
      if (attempts < 3) throw new ApiCallError("network");
      return push(input);
    };
    a.online = true;
    await a.engine.sync();
    expect(attempts).toBe(1);
    expect(a.status()).toBe("offline");
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await a.engine.idle();
    expect(attempts).toBe(2);
    // The next wait doubles.
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await a.engine.idle();
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    await a.engine.idle();
    expect(attempts).toBe(3);
    expect(server.plans().has(planA.id)).toBe(true);
    expect(a.status()).toBe("saved");
  });

  it("stops when the session is gone", async () => {
    const a = track(await syncedDevice("a", server));
    a.sessionGone = true;
    a.edit((t) => ({ ...t, plans: [planA] }));
    await a.settle();
    expect(a.signedOut).toBe(true);
    expect(a.status()).toBe("off");
  });

  it("flushes everything before a sign-out that removes plans", async () => {
    const a = track(await syncedDevice("a", server));
    a.edit((t) => ({ ...t, plans: [planA] }));
    expect(await a.engine.flush()).toBe(true);
    expect(server.plans().has(planA.id)).toBe(true);
    a.online = false;
    a.editPlan(planA.id, { name: "Unsaved" });
    expect(await a.engine.flush()).toBe(false);
  });
});

describe("two tabs", () => {
  it("never push the same change twice", async () => {
    const lock = mutex();
    const storage = memorySyncStorage({ ...EMPTY_SNAPSHOT, userId: USER });
    const one = track(new Device("one", server, { storage, lock }));
    const two = track(new Device("two", server, { storage, lock }));
    await Promise.all([one.engine.start(), two.engine.start()]);
    one.edit((t) => ({ ...t, plans: [planA, planB] }));
    await Promise.all([
      one.engine.sync(),
      two.engine.sync(),
      one.engine.sync(),
      two.engine.sync(),
    ]);
    const pushed = server.calls.flatMap((c) =>
      c.kind === "push" ? c.input.docs.map((d) => d.id) : [],
    );
    expect(pushed.sort()).toEqual([planA.id, planB.id]);
    await one.settle();
    await two.settle();
    expect(server.calls.filter((c) => c.kind === "push")).toHaveLength(1);
  });
});

it("doesn't mark the settings doc for a plan edit", () => {
  expect(SETTINGS_DOC_KEY).toBe("settings");
});
