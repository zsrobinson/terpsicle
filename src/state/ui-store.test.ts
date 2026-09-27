import { beforeEach, describe, expect, it } from "vitest";
import { resetStores } from "./testing";
import { uiPrefsOf, useUi } from "./ui-store";

// Which tab and drill-in are open is the URL's now (src/app/schedule-nav.ts,
// tested in src/app/schedule-nav.test.tsx and drill-stack.test.ts); the
// store keeps what isn't.

const ui = () => useUi.getState();

describe("the UI store", () => {
  beforeEach(resetStores);

  it("opens and collapses the sidebar", () => {
    ui().setSidebarOpen(false);
    expect(ui().sidebarOpen).toBe(false);
    ui().setSidebarOpen(true);
    expect(ui().sidebarOpen).toBe(true);
  });

  it("ignores malformed instructor-group keys", () => {
    ui().toggleGroup("CMSC351|A. Moreno");
    ui().toggleGroup("not a key");
    expect(ui().collapsedGroups).toEqual(["CMSC351|A. Moreno"]);
    ui().toggleGroup("CMSC351|A. Moreno");
    expect(ui().collapsedGroups).toEqual([]);
  });

  it("saves the last view on screen as the prefs' tab and drill-in", () => {
    useUi.setState({
      lastTab: "travel",
      lastDrill: { kind: "connection", connectionId: "M:a>b" },
    });
    expect(uiPrefsOf(ui())).toMatchObject({
      tab: "travel",
      drill: { kind: "connection", connectionId: "M:a>b" },
    });
  });
});
