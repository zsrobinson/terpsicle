import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withAiFeatures } from "~/core/prefs";
import type { Plan, SyncPullInput, SyncPushInput } from "~/core/schema";
import { savePrefs } from "~/features/prefs/save";
import { aBlock, aFourYear, aPlan, demoPlan, FakeSyncServer } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { newLocalId, nowIso } from "~/state/ids";
import { hydrate, type Persistence, startPersisting } from "~/state/persist";
import { resetStores, seedDemoWorkspace, TEST_TERM_ID } from "~/state/testing";
import { useWorkspace } from "~/state/workspace-store";
import { startSync, stopSync } from "./boot";
import type { SyncHost } from "./running";
import { SYNC_RESET_KEY, useSyncStatus } from "./status";

// The scheduler's side of plan sync: the workspace store, IndexedDB and the
// page wired to the engine, against a server in memory standing in for
// /api/sync/* (the engine's own tests cover the rules).

const server = vi.hoisted(() => ({
  current: null as null | {
    push: (i: SyncPushInput) => unknown;
    pull: (i: SyncPullInput) => unknown;
  },
}));

vi.mock("~/server/fns/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/fns/api")>();
  const call = async (answer: () => unknown) => {
    if (!server.current) throw new actual.ApiCallError("network");
    return structuredClone(answer());
  };
  return {
    ...actual,
    api: {
      ...actual.api,
      sync: {
        push: (input: SyncPushInput) =>
          call(() => server.current?.push(structuredClone(input))),
        pull: (input: SyncPullInput) => call(() => server.current?.pull(input)),
      },
    },
  };
});

let db: TerpsicleDb;
let persistence: Persistence;
let fake: FakeSyncServer;
let host: SyncHost;
let count = 0;

async function bootScheduler(): Promise<void> {
  db = new TerpsicleDb(`sync-boot-${++count}`);
  resetStores();
  await hydrate(db);
  persistence = startPersisting(db);
  host = {
    db,
    persistence,
    workspace: useWorkspace,
    status: useSyncStatus,
    ids: { now: nowIso, newId: newLocalId },
    reloadAccount: vi.fn(),
    toast: vi.fn(),
    trackFirstSignIn: vi.fn(),
    showPrefs: vi.fn(),
    settled: vi.fn(),
  };
}

const status = () => useSyncStatus.getState().status;
/** Pushes wait a second after an edit; the machine may be slow. */
const WAIT = { timeout: 10_000 };
// Each test waits up to WAIT more than once (a start, then a restart), so
// its own budget has to cover them: the UI project's default 5 s timed out
// under CI load before the waits could (#172's run).
const TEST_TIMEOUT = 30_000;

describe("plan sync in the scheduler", { timeout: TEST_TIMEOUT }, () => {
  beforeEach(async () => {
    fake = new FakeSyncServer(() => new Date().toISOString());
    server.current = fake;
    localStorage.clear();
    await bootScheduler();
  });

  afterEach(async () => {
    stopSync();
    await persistence.flushed();
    persistence.stop();
    db.close();
    await db.delete();
  });

  it("joins the account on the first sign-in, and says so quietly", async () => {
    seedDemoWorkspace();
    await persistence.flushed();
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    expect(fake.plans().size).toBe(3);
    expect(host.toast).toHaveBeenCalledWith(
      "Your 3 plans are saved to your account",
      undefined,
    );
    expect(host.trackFirstSignIn).toHaveBeenCalledWith({
      uploaded: 3,
      renamed: 0,
      copies: 0,
    });
    expect(useSyncStatus.getState().look?.saved.label).toBe("Saved");
    expect(await db.settings.get("sync")).toMatchObject({
      value: { userId: "tstudent" },
    });
  });

  it("remembers the account's four-year plan for Plan to open (QA P4)", async () => {
    const theirs = aFourYear({ id: "fouryear_acct_01", name: "My plan" });
    fake.push({
      docs: [{ kind: "four-year", id: theirs.id, baseRev: 0, body: theirs }],
    });
    // This device's own, open in Plan before signing in.
    await db.fourYear.put(aFourYear({ id: "fouryear_mine_01" }));
    await db.settings.put({
      key: "fourYear",
      value: { activeId: "fouryear_mine_01" },
    });
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    await vi.waitFor(async () =>
      expect((await db.settings.get("fourYear"))?.value).toEqual({
        activeId: theirs.id,
      }),
    );
  });

  it("pushes the person's edits, and shows the account's, clearing that plan's undo", async () => {
    seedDemoWorkspace();
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);

    useWorkspace.getState().commit("Renamed Plan A", (w) => ({
      ...w,
      plans: w.plans.map((p) =>
        p.id === demoPlan.id ? { ...p, name: "Mornings" } : p,
      ),
    }));
    expect(status()).toBe("saving");
    await vi.waitFor(
      () => expect(fake.plans().get(demoPlan.id)?.name).toBe("Mornings"),
      WAIT,
    );
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);

    // Another device renames it again.
    const rev = fake.docs.get(`plan:${demoPlan.id}`)?.rev ?? 0;
    fake.push({
      docs: [
        {
          kind: "plan",
          id: demoPlan.id,
          baseRev: rev,
          body: { ...demoPlan, name: "Evenings" },
        },
      ],
    });
    useSyncStatus.getState().syncNow?.();
    await vi.waitFor(
      () =>
        expect(
          useWorkspace.getState().plans.find((p) => p.id === demoPlan.id)?.name,
        ).toBe("Evenings"),
      WAIT,
    );
    // Undo can't bring back "Mornings": that step is gone.
    expect(useWorkspace.getState().past).toEqual([]);
    // And applying it wasn't an edit to push back.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(fake.docs.get(`plan:${demoPlan.id}`)?.rev).toBe(rev + 1);
  });

  it("carries the prefs other products save, and never drops the account's (QA1 C7)", async () => {
    seedDemoWorkspace();
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    const settings = () => {
      const doc = fake.docs.get("settings:settings");
      return doc?.kind === "settings" ? doc.body : null;
    };

    // Reviews turns AI summaries off on this device, beside the scheduler.
    await savePrefs((p) => withAiFeatures(p, false));
    await vi.waitFor(
      () => expect(settings()?.prefs).toEqual({ ai: { features: false } }),
      WAIT,
    );

    // The scheduler saves a block: its push carries the prefs.
    const run = aBlock({ id: "block_run_001", label: "Run" });
    useWorkspace
      .getState()
      .commit("Added a block", (w) => ({ ...w, blocks: [...w.blocks, run] }));
    await vi.waitFor(
      () => expect(settings()?.blocks.map((b) => b.id)).toContain(run.id),
      WAIT,
    );
    expect(settings()?.prefs).toEqual({ ai: { features: false } });

    // Another device sees Chat's rules, and saves a pref this build doesn't know.
    const stored = fake.docs.get("settings:settings");
    const theirs = {
      ai: { features: false },
      chatRules: { seen: ["CMSC351"] },
      later: { view: "week" },
    };
    const body = settings();
    if (!stored || !body) throw new Error("no settings doc");
    fake.push({
      docs: [
        {
          kind: "settings",
          id: "settings",
          baseRev: stored.rev,
          body: { ...body, prefs: theirs },
        },
      ],
    });
    useSyncStatus.getState().syncNow?.();
    await vi.waitFor(
      async () =>
        expect((await db.settings.get("prefs"))?.value).toEqual(theirs),
      WAIT,
    );
    expect(host.showPrefs).toHaveBeenLastCalledWith(theirs);

    // The scheduler saves again: nothing it doesn't own goes missing.
    useWorkspace.getState().commit("Removed a block", (w) => ({
      ...w,
      blocks: w.blocks.filter((b) => b.id !== run.id),
    }));
    await vi.waitFor(
      () => expect(settings()?.blocks.map((b) => b.id)).not.toContain(run.id),
      WAIT,
    );
    expect(settings()?.prefs).toEqual(theirs);
  });

  it("stops quietly on sign-out, and starts over after a sign-out elsewhere", async () => {
    useWorkspace.setState({ plans: [aPlan({ id: "plan_mine_01" })] });
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    stopSync();
    expect(status()).toBe("off");
    expect(useSyncStatus.getState().syncNow).toBeNull();

    // Signed out in this browser, a plan made meanwhile isn't dirty; the
    // next start joins the account afresh, so it goes up anyway.
    localStorage.setItem(SYNC_RESET_KEY, "1");
    useWorkspace.setState({
      plans: [
        ...useWorkspace.getState().plans,
        aPlan({ id: "plan_later_01", name: "Later" }),
      ],
    });
    host.toast = vi.fn();
    startSync(host, "tstudent");
    await vi.waitFor(
      () =>
        expect(host.toast).toHaveBeenCalledWith(
          "Your plan is saved to your account",
          undefined,
        ),
      WAIT,
    );
    expect(fake.plans().has("plan_later_01")).toBe(true);
    expect(localStorage.getItem(SYNC_RESET_KEY)).toBeNull();
  });

  it("drops the empty plan the app makes while the account's plans are on their way", async () => {
    // Another device saved this term's plans to the account.
    const theirs = [
      aPlan({ id: "plan_acct_a", name: "Plan A" }),
      aPlan({ id: "plan_acct_b", name: "Plan B", order: 1 }),
    ];
    fake.push({
      docs: theirs.map((body) => ({
        kind: "plan",
        id: body.id,
        baseRev: 0,
        body,
      })),
    });
    // A new device: the catalog's terms arrive while the first sign-in is
    // pulling, so the app makes its own "Plan A" then, and that plan's write
    // lands in IndexedDB only after the union has read it (held here).
    let release = () => {};
    let made = false;
    server.current = {
      push: (input) => fake.push(input),
      pull: (input) => {
        if (!made) {
          made = true;
          persistence.enqueue(
            () =>
              new Promise<void>((resolve) => {
                release = resolve;
              }),
          );
          useWorkspace.getState().ensurePlan(TEST_TERM_ID);
          expect(useWorkspace.getState().plans).toHaveLength(1);
        }
        return fake.pull(input);
      },
    };

    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    release();
    await persistence.flushed();

    const names = (plans: readonly Plan[]) =>
      [...plans].sort((a, b) => a.order - b.order).map((p) => p.name);
    expect(names(useWorkspace.getState().plans)).toEqual(["Plan A", "Plan B"]);
    expect(names(await db.plans.toArray())).toEqual(["Plan A", "Plan B"]);
    expect(fake.plans().size).toBe(2);
  });

  it("says offline, and saves once the server answers", async () => {
    server.current = null;
    useWorkspace.setState({ plans: [aPlan({ id: "plan_mine_01" })] });
    startSync(host, "tstudent");
    await vi.waitFor(() => expect(status()).toBe("offline"), WAIT);
    server.current = fake;
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    expect(fake.plans().has("plan_mine_01")).toBe(true);
  });
});
