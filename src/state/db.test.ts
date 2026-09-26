import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { LocalSeatAlert } from "~/core/schema";
import { aBlock, aFourYear, aPlan } from "~/fixtures";
import { DB_V1_STORES, TerpsicleDb } from "./db";
import { hydrate } from "./persist";
import {
  INITIAL_SEAT_ALERTS_STATE,
  startSeatAlerts,
  useSeatAlerts,
} from "./seat-alerts";
import { resetStores } from "./testing";
import { useWorkspace } from "./workspace-store";

// Dexie v1 → v2 (plan sync, DATA.md §5): everything a returning visitor has
// saved comes through, the seat alerts move to a settings row, and the new
// sync table starts empty, so their first sign-in merges as a first sign-in.

const NOW = "2026-09-25T12:00:00.000Z";
let count = 0;
let name = "";

const watch: LocalSeatAlert = {
  termId: "202701",
  sectionKey: "CMSC351-0301",
  email: "testudo@umd.edu",
  status: "active",
  subscriptionId: "s".repeat(22),
  manageToken: "t".repeat(43),
  createdAt: NOW,
  updatedAt: NOW,
};

/** A database as version 1 of the app left it. */
async function seedV1(): Promise<void> {
  const v1 = new Dexie(name);
  v1.version(1).stores(DB_V1_STORES);
  await v1.open();
  await v1
    .table("plans")
    .bulkPut([
      aPlan({ id: "planAAAA", termId: "202701" }),
      aPlan({ id: "planBBBB", termId: "202701", name: "Plan B", order: 1 }),
    ]);
  await v1.table("blocks").put(aBlock({ termId: "202701" }));
  await v1.table("courseColors").put({ courseCode: "CMSC351", color: "teal" });
  await v1.table("settings").bulkPut([
    {
      key: "travel",
      value: { pace: "faster", accessible: true, extraMinutes: 0 },
    },
  ]);
  await v1.table("seatAlerts").put(watch);
  await v1.table("files").put({
    key: "catalog/202701/x.json",
    family: "catalog",
    termId: "202701",
    data: {},
    storedAt: NOW,
  });
  v1.close();
}

describe("Dexie v2", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  it("upgrades a v1 database without losing anything", async () => {
    name = `upgrade-${++count}`;
    await seedV1();

    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "blocks",
      "courseColors",
      "files",
      "fourYear",
      "manifests",
      "plans",
      "settings",
      "syncDocs",
    ]);
    expect(await db.syncDocs.count()).toBe(0);
    expect(await db.settings.get("sync")).toBeUndefined();
    expect(await db.files.count()).toBe(1);

    resetStores();
    await hydrate(db);
    const w = useWorkspace.getState();
    expect(w.plans.map((p) => p.id).sort()).toEqual(["planAAAA", "planBBBB"]);
    expect(w.blocks).toHaveLength(1);
    expect(w.colors).toEqual({ CMSC351: "teal" });
    expect(w.travel.pace).toBe("faster");
    expect(w.chatPlans).toEqual({});

    useSeatAlerts.setState(INITIAL_SEAT_ALERTS_STATE);
    await startSeatAlerts(db);
    expect(useSeatAlerts.getState().alerts).toEqual([watch]);
    db.close();
  });

  it("upgrades a v1 database with no seat alerts", async () => {
    name = `upgrade-${++count}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(DB_V1_STORES);
    await v1.open();
    await v1.table("plans").put(aPlan({ id: "planAAAA" }));
    v1.close();

    const db = new TerpsicleDb(name);
    await db.open();
    expect(await db.plans.count()).toBe(1);
    expect(await db.settings.get("seatAlerts")).toBeUndefined();
    db.close();
  });

  it("makes a fresh database at v3", async () => {
    name = `fresh-${++count}`;
    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(3);
    await db.syncDocs.put({
      key: "plan:planAAAA",
      rev: 3,
      dirty: true,
      inFlight: false,
    });
    expect(await db.syncDocs.get("plan:planAAAA")).toMatchObject({ rev: 3 });
    db.close();
  });
});

// Dexie v2 → v3 (Terpsicle Plan, V3 §2.3–2.4): the `fourYear` table, and a
// signed-in device's pull cursor back to 0 so it pulls the four-year docs an
// older tab skipped.
describe("Dexie v3", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  async function seedV2(sync: unknown): Promise<void> {
    const v2 = new Dexie(name);
    v2.version(1).stores(DB_V1_STORES);
    v2.version(2).stores({ syncDocs: "key", seatAlerts: null });
    await v2.open();
    await v2.table("plans").put(aPlan({ id: "planAAAA" }));
    await v2.table("syncDocs").put({
      key: "plan:planAAAA",
      rev: 7,
      dirty: false,
      inFlight: false,
    });
    if (sync !== undefined)
      await v2.table("settings").put({ key: "sync", value: sync });
    v2.close();
  }

  it("resets the sync cursor and keeps everything else", async () => {
    name = `v3-${++count}`;
    await seedV2({ userId: "u_1", cursor: 42 });
    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(3);
    expect(await db.settings.get("sync")).toEqual({
      key: "sync",
      value: { userId: "u_1", cursor: 0 },
    });
    expect(await db.plans.count()).toBe(1);
    expect(await db.syncDocs.get("plan:planAAAA")).toMatchObject({ rev: 7 });
    expect(await db.fourYear.count()).toBe(0);
    await db.fourYear.put(aFourYear());
    expect(await db.fourYear.get(aFourYear().id)).toEqual(aFourYear());
    db.close();
  });

  it("upgrades a signed-out device with no sync row", async () => {
    name = `v3-${++count}`;
    await seedV2(undefined);
    const db = new TerpsicleDb(name);
    await db.open();
    expect(await db.settings.get("sync")).toBeUndefined();
    db.close();
  });
});
