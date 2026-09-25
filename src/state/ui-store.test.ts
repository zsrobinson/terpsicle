import { beforeEach, describe, expect, it } from "vitest";
import { resetStores } from "./testing";
import { useUi } from "./ui-store";

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

  it("stacks views, goes back one at a time, and to a breadcrumb", () => {
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
