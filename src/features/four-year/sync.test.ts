import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canUndo } from "~/core/plans/history";
import type { SyncPullInput, SyncPushInput } from "~/core/schema";
import { useSyncStatus } from "~/features/sync/status";
import { aFourYear, aFourYearEntry, FakeSyncServer } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { INITIAL_FOUR_YEAR_STORE, useFourYear, whenSaved } from "./store";
import { startPlanSync } from "./sync";

// Plan's side of sync (V3 §2.4): the engine the scheduler runs, wired to
// Plan's store and IndexedDB, against a server in memory standing in for
// /api/sync/* (the engine's own tests cover the rules).

const server = vi.hoisted(() => ({
  current: null as null | {
    push: (i: SyncPushInput) => unknown;
    pull: (i: SyncPullInput) => unknown;
  },
}));
const page = vi.hoisted(() => ({ db: null as unknown }));
const toasts = vi.hoisted(() => [] as string[]);

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
// The page's database, without the course index and catalog data.ts opens.
vi.mock("./data", () => ({ fourYearDb: () => page.db }));
vi.mock("sonner", () => ({ toast: (title: string) => toasts.push(title) }));
vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const NOW = "2026-10-01T15:00:00.000Z";
const WAIT = { timeout: 10_000 };
const status = () => useSyncStatus.getState().status;
const docs = () => useFourYear.getState().history.present.docs;

let db: TerpsicleDb;
let fake: FakeSyncServer;
let stop: () => void = () => {};
let count = 0;

describe("Plan's sync", () => {
  beforeEach(async () => {
    fake = new FakeSyncServer(() => new Date().toISOString());
    server.current = fake;
    toasts.length = 0;
    localStorage.clear();
    db = new TerpsicleDb(`plan-sync-${++count}`);
    page.db = db;
    useFourYear.setState(INITIAL_FOUR_YEAR_STORE);
    await useFourYear.getState().start(db);
  });

  afterEach(async () => {
    stop();
    await whenSaved();
    db.close();
    await db.delete();
  });

  it("joins the account, pushes edits, and shows the account's without an undo step", async () => {
    const { dispatch } = useFourYear.getState();
    dispatch({
      type: "create",
      id: "fouryear_mine_01",
      firstTermId: "202608",
      now: NOW,
    });
    dispatch({
      type: "add",
      docId: "fouryear_mine_01",
      entry: aFourYearEntry(),
      now: NOW,
    });
    await whenSaved();

    stop = startPlanSync("tstudent", vi.fn());
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);
    expect(fake.docs.get("four-year:fouryear_mine_01")?.body).toEqual(
      docs()[0],
    );
    expect(toasts).toContain("Your four-year plan is saved to your account");

    dispatch({
      type: "rename",
      docId: "fouryear_mine_01",
      name: "Mornings",
      now: NOW,
    });
    await vi.waitFor(
      () =>
        expect(fake.docs.get("four-year:fouryear_mine_01")?.body).toMatchObject(
          { name: "Mornings" },
        ),
      WAIT,
    );
    await vi.waitFor(() => expect(status()).toBe("saved"), WAIT);

    // Another device renames it again.
    const rev = fake.docs.get("four-year:fouryear_mine_01")?.rev ?? 0;
    const [current] = docs();
    if (!current) throw new Error("No doc");
    fake.push({
      docs: [
        {
          kind: "four-year",
          id: current.id,
          baseRev: rev,
          body: { ...current, name: "Evenings" },
        },
      ],
    });
    useSyncStatus.getState().syncNow?.();
    await vi.waitFor(() => expect(docs()[0]?.name).toBe("Evenings"), WAIT);
    // Undo can't bring back "Mornings", or the doc before the account had it.
    expect(canUndo(useFourYear.getState().history)).toBe(false);
    expect((await db.fourYear.toArray())[0]?.name).toBe("Evenings");
    // And applying it wasn't an edit to push back.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(fake.docs.get("four-year:fouryear_mine_01")?.rev).toBe(rev + 1);
  });

  it("brings a four-year plan from the account onto a new device", async () => {
    const theirs = aFourYear({ id: "fouryear_acct_01", name: "CS major" });
    fake.push({
      docs: [{ kind: "four-year", id: theirs.id, baseRev: 0, body: theirs }],
    });
    stop = startPlanSync("tstudent", vi.fn());
    await vi.waitFor(() => expect(docs()).toEqual([theirs]), WAIT);
    expect(toasts).toContain("Your four-year plan from your account is here");
    expect(useFourYear.getState().changedBy).toBe("account");
  });

  it("reads docs again that sync wrote while Plan wasn't showing", async () => {
    const mine = aFourYear({ id: "fouryear_mine_01" });
    useFourYear.getState().dispatch({
      type: "create",
      id: mine.id,
      firstTermId: "202608",
      now: NOW,
    });
    await whenSaved();
    // The scheduler's engine pulled a new version, and a new doc.
    const theirs = aFourYear({ id: "fouryear_acct_01", name: "CS major" });
    const [current] = docs();
    if (!current) throw new Error("No doc");
    await db.fourYear.bulkPut([{ ...current, name: "Renamed" }, theirs]);
    await useFourYear.getState().refresh();
    expect(docs().map((d) => d.name)).toEqual(["Renamed", "CS major"]);
    expect(useFourYear.getState().changedBy).toBe("account");
    expect(canUndo(useFourYear.getState().history)).toBe(false);
  });
});
