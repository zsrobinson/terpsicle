import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_UI_PREFS } from "~/core/schema";
import { TerpsicleDb } from "./db";
import { readSidebarWidth, writeSidebarWidth } from "./sidebar-width-pref";

// Plan's workbench shares the scheduler's sidebar width (UiPrefs) without
// its stores: one field, read and written in place.

let db: TerpsicleDb;
let count = 0;

beforeEach(async () => {
  db = new TerpsicleDb(`sidebar-width-${++count}`);
  await db.open();
});

afterEach(() => db.close());

describe("the sidebar width preference", () => {
  it("reads the default when nothing's saved", async () => {
    expect(await readSidebarWidth(db)).toBe(360);
  });

  it("reads the scheduler's saved width", async () => {
    await db.settings.put({
      key: "ui",
      value: { ...DEFAULT_UI_PREFS, sidebarWidth: 420 },
    });
    expect(await readSidebarWidth(db)).toBe(420);
  });

  it("writes only the width, keeping the scheduler's other prefs", async () => {
    await db.settings.put({
      key: "ui",
      value: {
        ...DEFAULT_UI_PREFS,
        tab: "search",
        sidebarOpen: false,
        lastTermId: "202701",
      },
    });
    await writeSidebarWidth(db, 400);
    expect(await db.settings.get("ui")).toEqual({
      key: "ui",
      value: {
        ...DEFAULT_UI_PREFS,
        tab: "search",
        sidebarOpen: false,
        lastTermId: "202701",
        sidebarWidth: 400,
      },
    });
  });

  it("starts the prefs from the defaults, clamped", async () => {
    await writeSidebarWidth(db, 900);
    expect(await db.settings.get("ui")).toEqual({
      key: "ui",
      value: { ...DEFAULT_UI_PREFS, sidebarWidth: 480 },
    });
  });
});
