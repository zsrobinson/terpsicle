import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncPullInput, SyncPushInput } from "~/core/schema";
import { aPlan, demoPlan, FakeSyncServer } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { newLocalId, nowIso } from "~/state/ids";
import { hydrate, type Persistence, startPersisting } from "~/state/persist";
import { resetStores, seedDemoWorkspace } from "~/state/testing";
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
  };
}

const status = () => useSyncStatus.getState().status;
/** Pushes wait a second after an edit; the machine may be slow. */
const WAIT = { timeout: 10_000 };

describe("plan sync in the scheduler", () => {
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
