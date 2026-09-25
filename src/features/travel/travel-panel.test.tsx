import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderPlanTab } from "~/features/courses/testing";
import { aPlan, fixtureTermId, mockSection, snapshotOf } from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

/** The Travel tab on the demo plan, with routes loaded. */
async function renderTravel(options?: { demo?: boolean }) {
  const view = await renderPlanTab([panels], "travel", options);
  await act(async () => {
    await useCatalog.getState().ensureCampus();
  });
  return view;
}

const connections = () => screen.getByRole("region", { name: "Connections" });
const calendar = () => screen.getByRole("region", { name: "Week calendar" });

describe("Travel tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("lists connections by day with walk, gap and verdict", async () => {
    await renderTravel();
    const list = connections();
    const monday = await within(list).findByRole("heading", { name: "Monday" });
    expect(monday).toBeInTheDocument();
    const tight = within(list).getAllByRole("button", {
      name: /^STAT400 to CMSC351: Tight: 8 min to get there, 10 min between classes/,
    });
    expect(tight).toHaveLength(3);
    expect(tight[0]).toHaveTextContent("ESJ → CSI · 8 min walk · 10 min gap");
    expect(tight[0]).toHaveTextContent("Tight");
  });

  it("updates verdicts, here and on the calendar, when a setting changes", async () => {
    const { user } = await renderTravel();
    await within(connections()).findAllByRole("button", {
      name: /^STAT400 to CMSC351: Tight/,
    });

    // +5 min per trip: 13 min in a 10-minute gap.
    await user.click(screen.getByRole("button", { name: "+5 min" }));
    expect(useWorkspace.getState().travel.extraMinutes).toBe(5);
    expect(
      within(connections()).getAllByRole("button", {
        name: /^STAT400 to CMSC351: Not enough time: 13 min to get there/,
      }),
    ).toHaveLength(3);
    expect(
      calendar().querySelector('[data-verdict="insufficient"]'),
    ).toHaveTextContent("13 min");
    expect(track).toHaveBeenCalledWith("travel_settings_changed", {
      setting: "extraMinutes",
      value: 5,
    });

    // Faster and no extra: 7 min is plenty.
    await user.click(screen.getByRole("button", { name: "No extra time" }));
    await user.click(screen.getByRole("button", { name: "Faster, 3.5 mph" }));
    expect(
      within(connections()).getAllByRole("button", {
        name: /^STAT400 to CMSC351: Plenty of time: 7 min to get there/,
      }),
    ).toHaveLength(3);
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
    expect(
      screen.getByText(/Estimates use campus paths at your pace\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How?" }));
    expect(
      screen.getByText(
        "ESJ → CSI: 1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min",
      ),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("travel_how_opened", {});
  });

  it("opens connection details from a row", async () => {
    const { user } = await renderTravel();
    const [row] = await within(connections()).findAllByRole("button", {
      name: /^STAT400 to CMSC351/,
    });
    if (!row) throw new Error("no row");
    await user.click(row);
    expect(useUi.getState().stack.at(-1)).toEqual({
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
