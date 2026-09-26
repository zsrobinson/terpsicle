import { beforeEach, describe, expect, it } from "vitest";
import { resetStores } from "./testing";
import { MOUNTED_DRILLS, stackFollowing, useUi } from "./ui-store";

const ui = () => useUi.getState();

describe("rail clicks", () => {
  beforeEach(resetStores);

  it("opens another tab", () => {
    expect(ui().clickTab("search")).toBe("opened");
    expect(ui()).toMatchObject({ tab: "search", sidebarOpen: true });
  });

  it("collapses on the open tab, and any tab reopens", () => {
    expect(ui().clickTab("courses")).toBe("collapsed");
    expect(ui().sidebarOpen).toBe(false);
    expect(ui().clickTab("travel")).toBe("opened");
    expect(ui()).toMatchObject({ tab: "travel", sidebarOpen: true });
    ui().clickTab("travel");
    expect(ui().clickTab("travel")).toBe("opened");
    expect(ui().sidebarOpen).toBe(true);
  });

  it("goes back to the tab's own panel before collapsing", () => {
    ui().drill({ kind: "course", courseCode: "CMSC351" });
    expect(ui().clickTab("courses")).toBe("back-to-root");
    expect(ui().stack).toEqual([]);
    expect(ui().sidebarOpen).toBe(true);
    expect(ui().clickTab("courses")).toBe("collapsed");
  });

  it("switching tabs leaves the drill-in", () => {
    ui().drill({ kind: "course", courseCode: "CMSC351" });
    ui().openTab("search");
    expect(ui().stack).toEqual([]);
  });
});

describe("drill-in stack", () => {
  beforeEach(resetStores);

  it("stacks views, closes one at a time, and down to the tab", () => {
    ui().drill({ kind: "course", courseCode: "CMSC351" });
    ui().drill({ kind: "connection", connectionId: "M:a>b" });
    ui().drill({ kind: "course", courseCode: "CMSC330" });
    expect(ui().stack).toHaveLength(3);
    expect(ui().back()).toBe(true);
    expect(ui().stack.at(-1)).toEqual({
      kind: "connection",
      connectionId: "M:a>b",
    });
    ui().backTo(0);
    expect(ui().stack).toEqual([]);
    expect(ui().back()).toBe(false);
  });

  it("opening what's already open keeps one level, taking the new sub-tab", () => {
    ui().drill({ kind: "course", courseCode: "CMSC351" });
    ui().drill({ kind: "course", courseCode: "CMSC351", tab: "grades" });
    expect(ui().stack).toEqual([
      { kind: "course", courseCode: "CMSC351", tab: "grades" },
    ]);
  });

  it("drilling in reopens a collapsed sidebar", () => {
    ui().clickTab("courses");
    ui().drill({ kind: "course", courseCode: "CMSC351" });
    expect(ui().sidebarOpen).toBe(true);
  });

  it("ignores malformed instructor-group keys", () => {
    ui().toggleGroup("CMSC351|A. Moreno");
    ui().toggleGroup("not a key");
    expect(ui().collapsedGroups).toEqual(["CMSC351|A. Moreno"]);
    ui().toggleGroup("CMSC351|A. Moreno");
    expect(ui().collapsedGroups).toEqual([]);
  });
});

describe("history", () => {
  beforeEach(resetStores);
  const a = { kind: "course", courseCode: "CMSC351" } as const;
  const b = { kind: "course", courseCode: "CMSC330" } as const;
  const conn = { kind: "connection", connectionId: "M:a>b" } as const;

  it("counts every move, so each gets its own history entry", () => {
    const moves = () => ui().navSeq;
    ui().openTab("search");
    expect(moves()).toBe(1);
    ui().drill(a);
    ui().drill(b);
    ui().back();
    ui().backTo(0);
    ui().setLastTermId("202608");
    expect(moves()).toBe(6);
    // Opening what's already open, a details sub-tab, collapsing: no move.
    ui().drill(a);
    ui().drill({ ...a, tab: "grades" });
    ui().replaceDrill({ ...a, tab: "about" });
    ui().clickTab("search");
    ui().clickTab("search");
    expect(ui().sidebarOpen).toBe(false);
    expect(moves()).toBe(8);
  });

  it("keeps a bounded number of views mounted", () => {
    for (let i = 0; i < MOUNTED_DRILLS + 3; i++)
      ui().drill({ kind: "course", courseCode: `CMSC${100 + i}` });
    expect(ui().stack).toHaveLength(MOUNTED_DRILLS);
    expect(ui().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: `CMSC${100 + MOUNTED_DRILLS + 2}`,
    });
  });

  it("Back returns to a view still mounted; Forward stacks it again", () => {
    expect(stackFollowing([a, b], a, "back")).toEqual([a]);
    expect(stackFollowing([a, b], null, "back")).toEqual([]);
    expect(stackFollowing([a], b, "forward")).toEqual([a, b]);
    // After a reload nothing is mounted under it: just that view.
    expect(stackFollowing([b], a, "back")).toEqual([a]);
    expect(stackFollowing([a], conn, "other")).toEqual([conn]);
  });

  it("the same view keeps its entry, and so its details sub-tab", () => {
    const stack = [{ ...a, tab: "grades" } as const];
    expect(stackFollowing(stack, a, "back")).toBe(stack);
  });

  it("following a URL shows it without counting a move", () => {
    ui().openTab("search");
    ui().followUrl({
      tab: "search",
      drill: a,
      lastTermId: null,
      direction: "other",
    });
    expect(ui().stack).toEqual([a]);
    expect(ui().navSeq).toBe(1);
    ui().clickTab("search");
    ui().clickTab("search");
    expect(ui().sidebarOpen).toBe(false);
    // A place the URL names is one you can see.
    ui().followUrl({
      tab: "courses",
      drill: b,
      lastTermId: "202608",
      direction: "back",
    });
    expect(ui()).toMatchObject({
      tab: "courses",
      stack: [b],
      lastTermId: "202608",
      sidebarOpen: true,
    });
    expect(ui().navSeq).toBe(2);
  });
});
