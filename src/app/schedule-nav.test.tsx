import { act, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPlans } from "~/fixtures";
import { seedDemoWorkspace, TEST_TERM_ID } from "~/state/testing";
import { type UiState, useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { openPlan } from "./actions";
import { useDrillEntry } from "./drill-entry";
import {
  closeDrill,
  currentView,
  goBack,
  goTo,
  openDrill,
} from "./schedule-nav";
import {
  currentPath,
  renderShell,
  type ShellRoutes,
  settle,
} from "./test-utils";

vi.mock("./analytics", () => ({ track: vi.fn() }));

// Where the scheduler is lives in its routes (src/app/README.md, "URL
// state"). These go through the router as the app does, and check the URL
// and history it leaves.

function Details() {
  const entry = useDrillEntry("course");
  return <p>Details for {entry.courseCode}</p>;
}
function Connection() {
  return <p>Connection details</p>;
}
const routes: ShellRoutes = {
  drills: { course: Details, connection: Connection },
};

const rail = () => screen.getByRole("navigation", { name: "Sidebar tabs" });
const railTab = (name: string) => within(rail()).getByRole("button", { name });
const historyIndex = (router: { history: { location: { state: unknown } } }) =>
  (router.history.location.state as { __TSR_index: number }).__TSR_index;

/** Local state has loaded, as the app's bootstrap says once it has. */
async function restore(patch: Partial<UiState> = {}) {
  act(() => useUi.setState({ ...patch, restored: true }));
  await settle();
}

beforeEach(() => {
  localStorage.clear();
});

describe("old-style URLs", () => {
  it("send a seat-alert email's course link to course details, replacing it", async () => {
    const { router } = await renderShell({
      routes,
      path: `/schedule?term=${TEST_TERM_ID}&course=cmsc216`,
    });
    expect(currentPath()).toBe(
      `/schedule/course/CMSC216?term=${TEST_TERM_ID}&tab=courses`,
    );
    expect(screen.getByText("Details for CMSC216")).toBeVisible();
    // Replaced, and then the tab put under it: Back stays in the app.
    expect(historyIndex(router)).toBe(1);
    expect(
      screen.getByRole("button", { name: "Back to Courses" }),
    ).toBeVisible();
  });

  it("send a tab to its route, with the params it reads", async () => {
    await renderShell({
      routes,
      path: "/schedule?tab=search&q=algo&level=300",
    });
    expect(currentPath()).toBe("/schedule/search?q=algo&level=300");
    expect(railTab("Search")).toHaveAttribute("aria-pressed", "true");
  });

  it("send `?tab=generate` to Generate", async () => {
    await renderShell({ routes, path: "/schedule?tab=generate&view=results" });
    // The results aren't saved, so the form shows (and the URL says so).
    expect(currentPath()).toBe("/schedule/generate");
  });

  it("send a connection over its tab", async () => {
    await renderShell({
      routes,
      path: "/schedule?tab=travel&connection=M%3Aa%3Eb",
    });
    expect(currentPath()).toMatch(
      /^\/schedule\/connection\/M%3Aa%3Eb\?tab=travel$/,
    );
    expect(screen.getByText("Connection details")).toBeVisible();
    expect(railTab("Travel")).toHaveAttribute("aria-pressed", "true");
  });

  it("drop a generated plan that's gone after a reload, for Generate", async () => {
    await renderShell({
      routes,
      path: "/schedule?tab=generate&result=r3&view=results",
    });
    expect(currentPath()).toBe("/schedule/generate");
  });

  it("keep a share link on /schedule, and open the saved view under it", async () => {
    await renderShell({ routes, path: "/schedule?plan=abc" });
    expect(currentPath()).toBe("/schedule?plan=abc");
    await restore({ lastTab: "travel" });
    expect(currentPath()).toMatch(/^\/schedule\/travel\?plan=abc&term=/);
  });
});

describe("plain /schedule", () => {
  it("opens the saved view once local state has loaded", async () => {
    const { router } = await renderShell({ routes, path: "/schedule" });
    await restore({
      lastTab: "search",
      lastDrill: { kind: "course", courseCode: "CMSC351" },
    });
    expect(currentPath()).toMatch(
      /^\/schedule\/course\/CMSC351\?term=\d+&planId=\w+&tab=search$/,
    );
    // Over its tab, so Back goes there, not out of the app.
    expect(historyIndex(router)).toBe(1);
    act(() => {
      goBack();
    });
    await settle();
    expect(currentPath()).toMatch(/^\/schedule\/search\?term=/);
  });

  it("never undoes a tab opened while saved state was loading", async () => {
    const { user } = await renderShell({ routes, path: "/schedule" });
    await user.click(railTab("Travel"));
    await restore({ lastTab: "blocks" });
    expect(currentPath()).toMatch(/^\/schedule\/travel\?term=/);
    expect(railTab("Travel")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("history", () => {
  it("pushes tabs and drill-ins, and never the same URL twice", async () => {
    const { router, user } = await renderShell({ routes });
    await user.click(railTab("Search"));
    expect(historyIndex(router)).toBe(1);
    act(() => openDrill({ kind: "course", courseCode: "CMSC351" }));
    expect(historyIndex(router)).toBe(2);
    expect(currentPath()).toBe("/schedule/course/CMSC351?tab=search");
    // Opening what's open, or a details sub-tab: no new entry.
    act(() => openDrill({ kind: "course", courseCode: "CMSC351" }));
    act(() =>
      openDrill({ kind: "course", courseCode: "CMSC351", tab: "grades" }),
    );
    expect(historyIndex(router)).toBe(2);
    expect(currentView().drill).toEqual({
      kind: "course",
      courseCode: "CMSC351",
      tab: "grades",
    });
  });

  it("Back is the browser's Back, and Forward returns", async () => {
    const { router } = await renderShell({ routes });
    act(() => openDrill({ kind: "course", courseCode: "CMSC351" }));
    act(() => openDrill({ kind: "course", courseCode: "CMSC330" }));
    act(() => {
      goBack();
    });
    await settle();
    expect(currentView().drill).toMatchObject({ courseCode: "CMSC351" });
    expect(historyIndex(router)).toBe(1);
    act(() => router.history.forward());
    await settle();
    expect(currentView().drill).toMatchObject({ courseCode: "CMSC330" });
    expect(screen.getByText("Details for CMSC330")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Back to CMSC351" }),
    ).toBeVisible();
  });

  it("closing a view goes somewhere new: it pushes, and Back reopens it", async () => {
    const { router } = await renderShell({ routes });
    act(() => openDrill({ kind: "course", courseCode: "CMSC351" }));
    act(() => {
      closeDrill();
    });
    expect(currentPath()).toBe("/schedule/courses");
    expect(historyIndex(router)).toBe(2);
    act(() => router.history.back());
    await settle();
    expect(screen.getByText("Details for CMSC351")).toBeVisible();
  });

  it("a move through history reopens a collapsed sidebar", async () => {
    const { router, user } = await renderShell({ routes });
    await user.click(railTab("Travel"));
    await user.click(railTab("Travel"));
    expect(useUi.getState().sidebarOpen).toBe(false);
    act(() => router.history.back());
    await settle();
    expect(useUi.getState().sidebarOpen).toBe(true);
    expect(railTab("Courses")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the term and the open plan", () => {
  async function renderDemo() {
    const view = await renderShell({ routes });
    act(() => seedDemoWorkspace());
    await restore();
    return view;
  }

  it("are written to the URL once loaded, replacing the entry", async () => {
    const { router } = await renderDemo();
    expect(currentPath()).toBe(
      `/schedule/courses?term=${TEST_TERM_ID}&planId=${demoPlans[0]?.id}`,
    );
    expect(historyIndex(router)).toBe(0);
  });

  it("a plan tab pushes; an edit that moves the open plan replaces", async () => {
    const { router } = await renderDemo();
    const b = demoPlans[1];
    if (!b) throw new Error("no Plan B");
    act(() => openPlan(TEST_TERM_ID, b.id));
    expect(currentPath()).toContain(`planId=${b.id}`);
    expect(historyIndex(router)).toBe(1);

    act(() => {
      useWorkspace.getState().undo();
      useWorkspace
        .getState()
        .activatePlan(TEST_TERM_ID, demoPlans[0]?.id ?? "");
    });
    await settle();
    expect(currentPath()).toContain(`planId=${demoPlans[0]?.id}`);
    expect(historyIndex(router)).toBe(1);

    // Back follows the URL back into the store.
    act(() => router.history.back());
    await settle();
    expect(useWorkspace.getState().activePlanByTerm[TEST_TERM_ID]).toBe(
      demoPlans[0]?.id,
    );
  });

  it("saves the view on screen for the next visit, when it's restorable", async () => {
    await renderDemo();
    act(() =>
      goTo({
        tab: "travel",
        drill: { kind: "connection", connectionId: "M:a>b" },
      }),
    );
    await settle();
    expect(useUi.getState()).toMatchObject({
      lastTab: "travel",
      lastDrill: { kind: "connection", connectionId: "M:a>b" },
    });
    // A generated plan isn't saved (results aren't), so none is remembered.
    act(() =>
      goTo({
        tab: "generate",
        drill: { kind: "generated-plan", resultId: "r1" },
      }),
    );
    await settle();
    expect(useUi.getState().lastDrill).toBeNull();
  });
});
