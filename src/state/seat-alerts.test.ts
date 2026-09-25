import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalSeatAlert } from "~/core/schema";
import { TerpsicleDb } from "./db";
import {
  findSeatAlert,
  INITIAL_SEAT_ALERTS_STATE,
  startSeatAlerts,
  useSeatAlerts,
} from "./seat-alerts";
import { TEST_TERM_ID } from "./testing";

const watch: LocalSeatAlert = {
  termId: TEST_TERM_ID,
  sectionKey: "CMSC351-0301",
  email: "testudo@umd.edu",
  status: "pending",
  subscriptionId: null,
  manageToken: null,
  createdAt: "2026-09-25T12:00:00.000Z",
  updatedAt: "2026-09-25T12:00:00.000Z",
};

let db: TerpsicleDb;
let count = 0;

describe("seat alerts store", () => {
  beforeEach(() => {
    useSeatAlerts.setState(INITIAL_SEAT_ALERTS_STATE);
    db = new TerpsicleDb(`seat-alerts-${++count}`);
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("writes through to Dexie and reads back on the next start", async () => {
    await startSeatAlerts(db);
    await useSeatAlerts.getState().put([watch]);
    await useSeatAlerts
      .getState()
      .put([
        { ...watch, status: "active", updatedAt: "2026-09-26T00:00:00.000Z" },
      ]);
    expect(await db.seatAlerts.count()).toBe(1);

    useSeatAlerts.setState(INITIAL_SEAT_ALERTS_STATE);
    await startSeatAlerts(db);
    const { alerts, loaded } = useSeatAlerts.getState();
    expect(loaded).toBe(true);
    expect(findSeatAlert(alerts, TEST_TERM_ID, "CMSC351-0301")?.status).toBe(
      "active",
    );

    await useSeatAlerts.getState().remove(TEST_TERM_ID, "CMSC351-0301");
    expect(await db.seatAlerts.count()).toBe(0);
  });

  it("skips invalid rows instead of failing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await db.seatAlerts.bulkPut([
      watch,
      { ...watch, sectionKey: "ENGL393-0101", email: "not an email" },
    ]);
    await startSeatAlerts(db);
    expect(useSeatAlerts.getState().alerts).toEqual([watch]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
