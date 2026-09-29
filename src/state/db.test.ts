import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { LOCAL_DB_VERSION } from "~/core/schema";
import {
  aBlock,
  aFourYear,
  aPlan,
  aPlanCourse,
  aSavedCourse,
} from "~/fixtures";
import {
  DB_V1_STORES,
  LEGACY_CHECKLIST_KEY,
  registeredFromChecklist,
  TerpsicleDb,
} from "./db";
import { hydrate } from "./persist";
import { resetStores } from "./testing";
import { useWorkspace } from "./workspace-store";

// Dexie v1 → v2 (plan sync, DATA.md §5): everything a returning visitor has
// saved comes through, the email-token seat alerts retire with their table
// (V2.md §6.5), and the new sync table starts empty, so their first sign-in
// merges as a first sign-in.

const NOW = "2026-09-25T12:00:00.000Z";
let count = 0;
let name = "";

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
  await v1.table("seatAlerts").put({
    termId: "202701",
    sectionKey: "CMSC351-0301",
    status: "active",
  });
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
    expect(db.verno).toBe(LOCAL_DB_VERSION);
    // The data cache's tables went with version 7.
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      "blocks",
      "courseColors",
      "fourYear",
      "plans",
      "settings",
      "syncDocs",
    ]);
    expect(await db.syncDocs.count()).toBe(0);
    expect(await db.settings.get("sync")).toBeUndefined();

    resetStores();
    await hydrate(db);
    const w = useWorkspace.getState();
    expect(w.plans.map((p) => p.id).sort()).toEqual(["planAAAA", "planBBBB"]);
    expect(w.blocks).toHaveLength(1);
    expect(w.colors).toEqual({ CMSC351: "teal" });
    expect(w.travel.pace).toBe("faster");
    expect(w.mainPlans).toEqual({});

    expect(await db.table("settings").get("seatAlerts")).toBeUndefined();
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
    expect(await db.table("settings").get("seatAlerts")).toBeUndefined();
    db.close();
  });

  it("makes a fresh database at the current version", async () => {
    name = `fresh-${++count}`;
    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(LOCAL_DB_VERSION);
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
    expect(db.verno).toBe(LOCAL_DB_VERSION);
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

// Dexie v3 → v4 (four-year sync, V3 §2.13): no table changes, and the pull
// cursor back to 0 once more, for the four-year docs pulls skipped between
// the two upgrades.
describe("Dexie v4", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  it("resets the sync cursor again and keeps the four-year docs", async () => {
    name = `v4-${++count}`;
    const v3 = new Dexie(name);
    v3.version(1).stores(DB_V1_STORES);
    v3.version(2).stores({ syncDocs: "key", seatAlerts: null });
    v3.version(3).stores({ fourYear: "id" });
    await v3.open();
    await v3.table("fourYear").put(aFourYear());
    await v3
      .table("settings")
      .put({ key: "sync", value: { userId: "u_1", cursor: 42 } });
    v3.close();

    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(LOCAL_DB_VERSION);
    expect(await db.settings.get("sync")).toEqual({
      key: "sync",
      value: { userId: "u_1", cursor: 0 },
    });
    expect(await db.fourYear.toArray()).toEqual([aFourYear()]);
    await db.syncDocs.put({
      key: `four-year:${aFourYear().id}`,
      rev: 1,
      dirty: true,
      inFlight: false,
    });
    expect(await db.syncDocs.count()).toBe(1);
    db.close();
  });
});

// Dexie v4 → v5 (Registered): the Register tab's ticks leave localStorage
// for each plan's `registered`, and a synced plan they change is unsaved.
describe("Dexie v5", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  const placed = aPlan({
    id: "planAAAA",
    courses: [
      aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
      aPlanCourse({ courseCode: "ENGL393", sectionCode: "0312" }),
      aSavedCourse("MUSC130"),
    ],
  });

  async function seedV4(): Promise<void> {
    const v4 = new Dexie(name);
    v4.version(1).stores(DB_V1_STORES);
    v4.version(2).stores({ syncDocs: "key", seatAlerts: null });
    v4.version(3).stores({ fourYear: "id" });
    v4.version(4).stores({});
    await v4.open();
    await v4
      .table("plans")
      .bulkPut([placed, aPlan({ id: "planBBBB", name: "Plan B", order: 1 })]);
    await v4.table("syncDocs").bulkPut([
      { key: "plan:planAAAA", rev: 7, dirty: false, inFlight: false },
      { key: "plan:planBBBB", rev: 3, dirty: false, inFlight: false },
    ]);
    v4.close();
  }

  /** A localStorage with `ticks` saved the way the old checklist did. */
  function storage(ticks: unknown) {
    const items = new Map([[LEGACY_CHECKLIST_KEY, JSON.stringify(ticks)]]);
    return {
      getItem: (key: string) => items.get(key) ?? null,
      removeItem: (key: string) => void items.delete(key),
      items,
    };
  }

  /** The current database, upgraded with `local` as its localStorage. */
  class WithStorage extends TerpsicleDb {
    constructor(dbName: string, local: ReturnType<typeof storage>) {
      super(dbName);
      this.version(5).stores({}).upgrade(registeredFromChecklist(local));
    }
  }

  it("moves the ticks into the plans and marks them unsaved", async () => {
    name = `v5-${++count}`;
    await seedV4();
    const local = storage({
      // A switched section's tick and an unknown plan's are dropped.
      planAAAA: ["ENGL393-0312", "CMSC351-0101", "CMSC351-0201"],
      planZZZZ: ["CMSC351-0101"],
    });
    const db = new WithStorage(name, local);
    await db.open();
    expect(db.verno).toBe(LOCAL_DB_VERSION);
    expect((await db.plans.get("planAAAA"))?.registered).toEqual([
      "ENGL393-0312",
      "CMSC351-0101",
    ]);
    expect(await db.plans.get("planBBBB")).not.toHaveProperty("registered");
    expect(await db.syncDocs.get("plan:planAAAA")).toMatchObject({
      rev: 7,
      dirty: true,
    });
    expect(await db.syncDocs.get("plan:planBBBB")).toMatchObject({
      dirty: false,
    });
    expect(local.items.has(LEGACY_CHECKLIST_KEY)).toBe(false);
    db.close();
  });

  it("upgrades with no ticks, or ones that don't read", async () => {
    name = `v5-${++count}`;
    await seedV4();
    const db = new WithStorage(name, storage("not a checklist"));
    await db.open();
    expect(await db.plans.get("planAAAA")).toEqual(placed);
    expect(await db.syncDocs.get("plan:planAAAA")).toMatchObject({
      dirty: false,
    });
    db.close();
  });
});

describe("Dexie v6", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  async function seedV5(chatPlans: unknown): Promise<void> {
    const v5 = new Dexie(name);
    v5.version(1).stores(DB_V1_STORES);
    v5.version(2).stores({ syncDocs: "key", seatAlerts: null });
    v5.version(3).stores({ fourYear: "id" });
    v5.version(4).stores({});
    v5.version(5).stores({});
    await v5.open();
    await v5
      .table("plans")
      .bulkPut([
        aPlan({ id: "planAAAA" }),
        aPlan({ id: "planBBBB", name: "Plan B", order: 1 }),
      ]);
    await v5.table("settings").put({ key: "chatPlans", value: chatPlans });
    v5.close();
  }

  it("renames the chat plans row: each term's main plan", async () => {
    name = `v6-${++count}`;
    await seedV5({ "202701": "planBBBB" });
    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(LOCAL_DB_VERSION);
    expect(await db.settings.get("mainPlans")).toEqual({
      key: "mainPlans",
      value: { "202701": "planBBBB" },
    });
    expect(await db.table("settings").get("chatPlans")).toBeUndefined();
    resetStores();
    await hydrate(db);
    expect(useWorkspace.getState().mainPlans).toEqual({ "202701": "planBBBB" });
    db.close();
  });

  it("drops a row that doesn't read", async () => {
    name = `v6-${++count}`;
    await seedV5("not a map");
    const db = new TerpsicleDb(name);
    await db.open();
    expect(await db.settings.get("mainPlans")).toBeUndefined();
    expect(await db.table("settings").get("chatPlans")).toBeUndefined();
    db.close();
  });
});

describe("Dexie v7", () => {
  afterEach(async () => {
    await Dexie.delete(name);
  });

  /** A database as version 6 left it, with the published-data cache full. */
  async function seedV6(): Promise<void> {
    const v6 = new Dexie(name);
    v6.version(1).stores(DB_V1_STORES);
    v6.version(2).stores({ syncDocs: "key", seatAlerts: null });
    v6.version(3).stores({ fourYear: "id" });
    v6.version(4).stores({});
    v6.version(5).stores({});
    v6.version(6).stores({});
    await v6.open();
    await v6.table("plans").put(aPlan({ id: "planAAAA" }));
    await v6.table("fourYear").put(aFourYear());
    await v6.table("settings").put({ key: "mainPlans", value: {} });
    await v6
      .table("manifests")
      .bulkPut(
        ["catalog/202701/manifest.json", "planetterp/manifest.json"].map(
          (key) => ({ key, data: {}, checkedAt: NOW, etag: null }),
        ),
      );
    await v6.table("files").bulkPut(
      [
        ["catalog/202701/dept/CMSC.0000000000000001.json", "catalog"],
        ["planetterp/dept/CMSC.0000000000000002.json", "planetterp"],
        ["geo/routes.0000000000000003.bin", "geo"],
        ["calendar/202701.json", "calendar"],
        ["reviews/dept/CMSC.0000000000000004.json", "reviews"],
      ].map(([key, family]) => ({
        key,
        family,
        termId: null,
        data: {},
        storedAt: NOW,
      })),
    );
    v6.close();
  }

  it("drops the published-data cache, and keeps everything a person made", async () => {
    name = `v7-${++count}`;
    await seedV6();
    const db = new TerpsicleDb(name);
    await db.open();
    expect(db.verno).toBe(LOCAL_DB_VERSION);
    const tables = db.tables.map((t) => t.name);
    expect(tables).not.toContain("manifests");
    expect(tables).not.toContain("files");
    expect(await db.plans.count()).toBe(1);
    expect(await db.fourYear.count()).toBe(1);
    expect(await db.settings.get("mainPlans")).toEqual({
      key: "mainPlans",
      value: {},
    });
    db.close();
  });
});
