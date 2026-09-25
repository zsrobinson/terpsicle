import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aBlock } from "~/fixtures";
import { TerpsicleDb } from "./db";
import {
  diffById,
  hydrate,
  type Persistence,
  startPersisting,
} from "./persist";
import { resetStores } from "./testing";
import { useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

const SPRING = "202701";
const NOW = "2026-09-25T12:00:00.000Z";

let db: TerpsicleDb;
let persistence: Persistence;
let dbCount = 0;

async function reload(): Promise<void> {
  await persistence.flushed();
  persistence.stop();
  resetStores();
  await hydrate(db);
  persistence = startPersisting(db);
}

describe("persistence", () => {
  beforeEach(async () => {
    db = new TerpsicleDb(`test-${++dbCount}`);
    resetStores();
    await hydrate(db);
    persistence = startPersisting(db);
  });

  afterEach(async () => {
    await persistence.flushed();
    persistence.stop();
    db.close();
  });

  it("declares DATA.md §5's tables and keys", () => {
    expect(
      Object.fromEntries(
        db.tables.map((t) => [
          t.name,
          [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)],
        ]),
      ),
    ).toEqual({
      plans: ["id", "termId"],
      blocks: ["id", "termId"],
      courseColors: ["courseCode"],
      settings: ["key"],
      seatAlerts: ["[termId+sectionKey]", "termId"],
      manifests: ["key"],
      files: ["key", "family", "termId"],
    });
  });

  it("starts with defaults when nothing is saved", () => {
    expect(useWorkspace.getState()).toMatchObject({
      hydrated: true,
      plans: [],
      travel: { pace: "typical", accessible: false, extraMinutes: 0 },
    });
    expect(useUi.getState()).toMatchObject({
      tab: "courses",
      sidebarOpen: true,
      theme: "system",
    });
  });

  it("round-trips plans, blocks, colors, travel and UI prefs", async () => {
    const w = useWorkspace.getState();
    w.dispatch(
      { type: "plan/create", id: "planAAAA", termId: SPRING, now: NOW },
      "Created",
    );
    w.dispatch(
      { type: "plan/create", id: "planBBBB", termId: SPRING, now: NOW },
      "Created",
    );
    w.commit("Added a block", (s) => ({
      ...s,
      blocks: [aBlock({ termId: SPRING })],
      colors: { CMSC351: "violet" },
    }));
    w.setTravel({ pace: "faster", accessible: true });
    w.activatePlan(SPRING, "planAAAA");
    const ui = useUi.getState();
    ui.clickTab("travel");
    ui.drill({ kind: "course", courseCode: "CMSC351", tab: "grades" });
    ui.setTheme("dark");
    ui.setLastTermId(SPRING);
    ui.drill({ kind: "course", courseCode: "CMSC351" });

    const before = {
      plans: useWorkspace.getState().plans,
      blocks: useWorkspace.getState().blocks,
      colors: useWorkspace.getState().colors,
    };
    await reload();

    const after = useWorkspace.getState();
    expect(after.plans).toEqual(before.plans);
    expect(after.blocks).toEqual(before.blocks);
    expect(after.colors).toEqual(before.colors);
    expect(after.travel).toEqual({
      pace: "faster",
      accessible: true,
      extraMinutes: 0,
    });
    expect(after.activePlanByTerm).toEqual({ [SPRING]: "planAAAA" });
    // Undo history is per visit.
    expect(after.past).toEqual([]);
    expect(useUi.getState()).toMatchObject({
      tab: "travel",
      theme: "dark",
      lastTermId: SPRING,
      stack: [{ kind: "course", courseCode: "CMSC351" }],
    });
  });

  it("writes deletes, and undo writes the plan back", async () => {
    const w = useWorkspace.getState();
    w.dispatch(
      { type: "plan/create", id: "planAAAA", termId: SPRING, now: NOW },
      "Created",
    );
    w.dispatch(
      { type: "plan/create", id: "planBBBB", termId: SPRING, now: NOW },
      "Created",
    );
    w.dispatch(
      {
        type: "plan/delete",
        planId: "planBBBB",
        replacementId: "unusedID",
        now: NOW,
      },
      "Deleted Plan B",
    );
    await persistence.flushed();
    expect(await db.plans.count()).toBe(1);
    useWorkspace.getState().undo();
    await persistence.flushed();
    expect((await db.plans.toArray()).map((p) => p.id).sort()).toEqual([
      "planAAAA",
      "planBBBB",
    ]);
  });

  it("skips an invalid row instead of failing the load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useWorkspace
      .getState()
      .dispatch(
        { type: "plan/create", id: "planAAAA", termId: SPRING, now: NOW },
        "Created",
      );
    await persistence.flushed();
    await db.plans.put({
      id: "broken!!",
      termId: "nope",
    } as never);
    await reload();
    expect(useWorkspace.getState().plans.map((p) => p.id)).toEqual([
      "planAAAA",
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("remembers the innermost drill-in only", async () => {
    useUi.getState().drill({ kind: "course", courseCode: "CMSC351" });
    useUi.getState().drill({ kind: "connection", connectionId: "M:a>b" });
    await reload();
    expect(useUi.getState().stack).toEqual([
      { kind: "connection", connectionId: "M:a>b" },
    ]);
  });
});

describe("diffById", () => {
  it("puts changed and new rows and deletes missing ones", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const b2 = { id: "b" };
    const c = { id: "c" };
    expect(diffById([a, b], [a, b2, c], (x) => x.id)).toEqual({
      put: [b2, c],
      remove: [],
    });
    expect(diffById([a, b], [b], (x) => x.id)).toEqual({
      put: [],
      remove: ["a"],
    });
  });
});
