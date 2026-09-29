import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPlanTab } from "~/features/courses/testing";
import { currentView } from "~/features/schedule/schedule-nav";
import type { ShellRoutes } from "~/features/schedule/test-utils";
import {
  aPlan,
  fixtureTermId,
  mockDataSource,
  mockSection,
  snapshotOf,
} from "~/fixtures";
import { track } from "~/lib/analytics";
import { createBucketDataSource } from "~/state/data-source";
import { ensureCampus } from "~/state/query/catalog";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "~/state/query/persister";
import { createTestQueryClient } from "~/state/query/testing";
import { loadCampus } from "~/state/testing";
import { useWorkspace } from "~/state/workspace-store";
import { ConnectionDetails } from "./connection-details";
import { useTravelSettingsOpen } from "./settings-store";
import { TravelPanel } from "./travel-panel";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

const panels: ShellRoutes = {
  tabs: { travel: TravelPanel },
  drills: { connection: ConnectionDetails },
};

/** The Travel tab on the demo plan, with routes loaded. */
async function renderTravel(options?: { demo?: boolean }) {
  const view = await renderPlanTab([panels], "travel", options);
  await act(async () => {
    await loadCampus(view.queryClient);
  });
  // The list, once it's worked out: the query cache tells the panel on
  // its next tick, not within the load.
  await screen.findByRole("region", { name: "Connections" });
  return view;
}

const connections = () => screen.getByRole("region", { name: "Connections" });
const calendar = () => screen.getByRole("region", { name: "Week calendar" });
const openSettings = (user: { click: (e: Element) => Promise<void> }) =>
  user.click(screen.getByRole("button", { name: /^Typical pace ·|pace ·/ }));

describe("Travel tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    useTravelSettingsOpen.setState({ open: false });
  });

  it("lists connections first, the same walk on several days as one row", async () => {
    await renderTravel();
    const list = connections();
    const back = await within(list).findByRole("region", {
      name: "Back to back",
    });
    const tight = within(back).getAllByRole("button", {
      name: /^STAT400 to CMSC351, Mon, Wed and Fri: Tight: 8 min to get there, 10 min between classes/,
    });
    expect(tight).toHaveLength(1);
    expect(tight[0]).toHaveTextContent(
      "Mon, Wed, Fri · ESJ → CSI · 8 min walk · 10 min gap",
    );
    // The tight one comes first, with its status on the right.
    const rows = within(back).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/^STAT400 → CMSC351\s*Tight\s*Mon/);
    // The settings are one line until opened.
    expect(
      screen.getByRole("button", {
        name: /Typical pace · no extra time · standard routes/,
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("switch", { name: /Accessible routes/ }),
    ).toBeNull();
  });

  it("keeps longer breaks, under their own heading", async () => {
    await renderTravel();
    const apart = await within(connections()).findByRole("region", {
      name: "Longer breaks",
    });
    // CMSC330 (IRB) ends at 10:45, ECON200 (VMH) starts at 2pm.
    expect(
      within(apart).getByRole("button", {
        name: /^CMSC330 to ECON200, Tue and Thu: Plenty of time/,
      }),
    ).toHaveTextContent("3 hr 15 min gap");
    expect(apart).toHaveTextContent("Over 30 min · not on the calendar");
  });

  it("updates verdicts, here and on the calendar, when a setting changes", async () => {
    const { user } = await renderTravel();
    await within(connections()).findAllByRole("button", {
      name: /^STAT400 to CMSC351, .*: Tight/,
    });
    await openSettings(user);

    // +5 min per trip: 13 min in a 10-minute gap.
    await user.click(screen.getByRole("button", { name: "+5 min" }));
    expect(useWorkspace.getState().travel.extraMinutes).toBe(5);
    expect(
      within(connections()).getByRole("button", {
        name: /^STAT400 to CMSC351, .*: Not enough time: 13 min to get there/,
      }),
    ).toBeInTheDocument();
    expect(
      calendar().querySelector('[data-verdict="insufficient"]'),
    ).toHaveTextContent("13 min");
    expect(track).toHaveBeenCalledWith("travel_settings_changed", {
      setting: "extraMinutes",
      value: 5,
    });
    expect(
      screen.getByRole("button", { name: /Typical pace · \+5 min a trip/ }),
    ).toBeInTheDocument();

    // Faster and no extra: 7 min is plenty.
    await user.click(screen.getByRole("button", { name: "No extra time" }));
    await user.click(screen.getByRole("button", { name: "Faster, 3.5 mph" }));
    expect(
      within(connections()).getByRole("button", {
        name: /^STAT400 to CMSC351, .*: Plenty of time: 7 min to get there/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Faster, 3.5 mph" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(track).toHaveBeenCalledWith("travel_settings_changed", {
      setting: "pace",
      value: "faster",
    });
  });

  it("switches to accessible routes", async () => {
    const { user } = await renderTravel();
    await openSettings(user);
    const toggle = screen.getByRole("switch", { name: /Accessible routes/ });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(useWorkspace.getState().travel.accessible).toBe(true);
    expect(track).toHaveBeenCalledWith("travel_settings_changed", {
      setting: "accessible",
      value: true,
    });
    expect(document.body.textContent).not.toMatch(/step-free/i);
  });

  it("shows the math for one real connection under How?", async () => {
    const { user } = await renderTravel();
    await within(connections()).findAllByRole("button", {
      name: /^STAT400 to CMSC351/,
    });
    await openSettings(user);
    expect(
      screen.getByText(/Estimates use campus paths at your pace\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How?" }));
    expect(
      screen.getByText(": 1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min", {
        exact: false,
      }),
    ).toHaveTextContent(
      "ESJ → CSI: 1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min",
    );
    expect(track).toHaveBeenCalledWith("travel_how_opened", {});
  });

  it("opens connection details from a row", async () => {
    const { user } = await renderTravel();
    const [row] = await within(connections()).findAllByRole("button", {
      name: /^STAT400 to CMSC351/,
    });
    if (!row) throw new Error("no row");
    await user.click(row);
    expect(currentView().drill).toEqual({
      kind: "connection",
      connectionId: "M:STAT400-0101#0>CMSC351-0301#0",
    });
  });

  it("says why there's nothing to list", async () => {
    await renderTravel({ demo: false });
    act(() => {
      const plan = aPlan({
        id: "plan_one",
        termId: fixtureTermId,
        courses: [
          {
            courseCode: "ECON200",
            sectionCode: "0101",
            snapshot: snapshotOf(mockSection("ECON200-0101")),
          },
        ],
      });
      useWorkspace.setState({
        plans: [plan],
        activePlanByTerm: { [fixtureTermId]: plan.id },
      });
    });
    await waitFor(() =>
      expect(connections()).toHaveTextContent(
        "No back-to-back classes in different buildings.",
      ),
    );
  });
});

describe("a routes file that doesn't decode", () => {
  /** The mock bucket serving broken routes bytes (the magic wiped). */
  function serveBrokenRoutes() {
    const real = mockDataSource.get.bind(mockDataSource);
    return vi.spyOn(mockDataSource, "get").mockImplementation(async (key) => {
      const bytes = await real(key);
      if (!bytes || !key.startsWith("geo/routes.")) return bytes;
      const broken = bytes.slice();
      broken.fill(0, 0, 4);
      return broken;
    });
  }

  /** Schedule is up, and travel has stopped loading: no route data, not a crash. */
  async function expectTravelWithoutRoutes() {
    expect(calendar()).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText("Working out travel times")).toBeNull(),
    );
    expect(
      within(connections()).getAllByRole("button", {
        name: /^STAT400 to CMSC351.*No route data yet/,
      }).length,
    ).toBeGreaterThan(0);
  }

  const routesRows = (storage: { rows: Map<string, unknown> }) =>
    [...storage.rows].filter(([k]) => k.includes("geo/routes."));

  let storage: ReturnType<typeof createMemoryQueryStorage>;
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage = createMemoryQueryStorage();
    setQueryStorage(storage);
  });
  afterEach(() => {
    setQueryStorage(null);
    vi.restoreAllMocks();
  });

  it("from the server: Schedule stays up, travel shows no route data, and nothing's saved", async () => {
    serveBrokenRoutes();
    await renderPlanTab([panels], "travel");
    await expectTravelWithoutRoutes();
    await flushQueryStorage();
    expect(routesRows(storage)).toEqual([]);
  });

  it("from disk: the saved copy is dropped rather than crashing every reload", async () => {
    // An earlier visit saved the routes file; the copy on disk has since gone bad.
    const earlier = createTestQueryClient();
    await ensureCampus(earlier, createBucketDataSource(mockDataSource));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushQueryStorage();
    const [saved] = routesRows(storage);
    if (!saved) throw new Error("the routes file was saved");
    const row = saved[1] as { state: { data: ArrayBuffer } };
    new Uint8Array(row.state.data).fill(0, 0, 4);
    // And the server's is broken too, so there's nothing good to fall back on.
    serveBrokenRoutes();

    await renderPlanTab([panels], "travel");
    await expectTravelWithoutRoutes();
    await flushQueryStorage();
    expect(routesRows(storage)).toEqual([]);
  });
});
