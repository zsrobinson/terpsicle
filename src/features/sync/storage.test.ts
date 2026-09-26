import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UI_PREFS } from "~/core/schema";
import { planDocKey, SETTINGS_DOC_KEY, settingsDocOf } from "~/core/sync";
import { aBlock, aPlan, aSettingsDoc } from "~/fixtures";
import { TerpsicleDb } from "~/state/db";
import { dexieSyncStorage, markEdited } from "./storage";

// Plan sync's state in IndexedDB (Dexie v2): one transaction reads the synced
// tables and the flags, and writes back only what a step changed.

let db: TerpsicleDb;
let count = 0;
const planA = aPlan({ id: "plan_a_0001" });
const planB = aPlan({ id: "plan_b_0001", name: "Plan B", order: 1 });

describe("dexieSyncStorage", () => {
  beforeEach(async () => {
    db = new TerpsicleDb(`sync-storage-${++count}`);
    await db.plans.bulkPut([planA, planB]);
    await db.blocks.put(aBlock());
    await db.courseColors.put({ courseCode: "CMSC351", color: "teal" });
    await db.settings.put({
      key: "travel",
      value: { pace: "faster", accessible: false, extraMinutes: 0 },
    });
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("reads the synced tables, with no account before a first sign-in", async () => {
    const snapshot = await dexieSyncStorage(db).read();
    expect(snapshot.userId).toBeNull();
    expect(snapshot.sync).toEqual({ cursor: 0, docs: {} });
    expect(snapshot.base).toBeNull();
    expect(snapshot.tables).toMatchObject({
      plans: [planA, planB],
      blocks: [aBlock()],
      colors: { CMSC351: "teal" },
      travel: { pace: "faster" },
      chatPlans: {},
    });
  });

  it("writes back only what a step changed: tables, flags, base and cursor", async () => {
    const storage = dexieSyncStorage(db);
    const base = aSettingsDoc();
    await storage.update((s) => ({
      userId: "tstudent",
      base,
      sync: {
        cursor: 7,
        docs: {
          [planDocKey(planA.id)]: { rev: 3, dirty: false, inFlight: false },
          [SETTINGS_DOC_KEY]: { rev: 7, dirty: false, inFlight: false },
        },
      },
      tables: {
        ...s.tables,
        plans: [{ ...planA, name: "Renamed" }],
        chatPlans: { "202701": planA.id },
      },
    }));
    expect((await db.plans.toArray()).map((p) => p.name)).toEqual(["Renamed"]);
    expect(await db.settings.get("sync")).toEqual({
      key: "sync",
      value: { userId: "tstudent", cursor: 7 },
    });
    expect(await db.syncDocs.get(SETTINGS_DOC_KEY)).toEqual({
      key: SETTINGS_DOC_KEY,
      rev: 7,
      dirty: false,
      inFlight: false,
      base,
    });

    await storage.update((s) => markEdited(s, [planDocKey(planA.id)]));
    const again = await storage.read();
    expect(again.userId).toBe("tstudent");
    expect(again.base).toEqual(base);
    expect(again.sync.docs[planDocKey(planA.id)]).toEqual({
      rev: 3,
      dirty: true,
      inFlight: false,
    });
    expect(again.tables.chatPlans).toEqual({ "202701": planA.id });
    expect(settingsDocOf(again.tables).blocks).toEqual([aBlock()]);
  });

  it("forgets the account on sign-out, and clears the device on remove", async () => {
    const storage = dexieSyncStorage(db);
    await storage.update((s) => ({
      ...s,
      userId: "tstudent",
      sync: {
        cursor: 2,
        docs: {
          [planDocKey(planA.id)]: { rev: 2, dirty: true, inFlight: false },
        },
      },
    }));
    await storage.clearSync();
    const kept = await storage.read();
    expect(kept.userId).toBeNull();
    expect(kept.sync).toEqual({ cursor: 0, docs: {} });
    expect(kept.tables.plans).toHaveLength(2);

    await db.settings.put({ key: "ui", value: DEFAULT_UI_PREFS });
    await storage.clearAll();
    expect(await db.plans.count()).toBe(0);
    expect(await db.blocks.count()).toBe(0);
    expect(await db.courseColors.count()).toBe(0);
    expect(await db.settings.get("travel")).toBeUndefined();
    // Not synced, not the plans: UI prefs stay.
    expect(await db.settings.get("ui")).toBeDefined();
  });
});
