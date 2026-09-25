import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import { useCatalog } from "~/state/catalog-store";
import { useUi } from "~/state/ui-store";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

// The demo plan's connections (src/fixtures/mock/plans.ts):
// STAT400 in ESJ → CMSC351 in CSI, MWF: tight, and the fixtures have no
// route geometry for ESJ–CSI. CMSC330 in IRB → ECON200 in VMH, TuTh: plenty
// of time, with UMD's real standard route (but no accessible one).
const TIGHT = "M:STAT400-0101#0>CMSC351-0301#0";
const WITH_ROUTE = "Tu:CMSC330-0103#0>ECON200-0101#0";

async function openConnection(connectionId: string) {
  const view = await renderPlanTab([panels], "travel");
  await act(async () => {
    await useCatalog.getState().ensureCampus();
    useUi.getState().drill({ kind: "connection", connectionId });
  });
  return view;
}

describe("connection details", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("states the verdict, the places, the distance and the math", async () => {
    await openConnection(TIGHT);
    const verdict = await screen.findByTestId("verdict");
    expect(verdict).toHaveTextContent(
      "Tight8 min to get there, 10 min between classes.",
    );
    expect(screen.getByText("Every Mon, Wed and Fri")).toBeInTheDocument();
    await screen.findByText("Edward St. John Learning & Teaching Center");
    expect(
      screen.getByText("Computer Science Instructional Center"),
    ).toBeInTheDocument();
    expect(screen.getByText("1,999 ft")).toBeInTheDocument();
    expect(
      screen.getByText("1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min"),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("connection_opened", {
      verdict: "tight",
    });
  });

  it("hides the map, quietly, when there's no route geometry", async () => {
    await openConnection(TIGHT);
    expect(
      await screen.findByText("Map unavailable for this route"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("route-drawing")).toBeNull();
    expect(screen.queryByTestId("route-map")).toBeNull();
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith("route_map_shown", {
        mode: "standard",
        hasGeometry: false,
      }),
    );
  });

  it("draws UMD's route, and hides it for a mode with no geometry", async () => {
    const { user } = await openConnection(WITH_ROUTE);
    const drawing = await screen.findByTestId("route-drawing");
    expect(drawing).toHaveAccessibleName("Walking route from IRB to VMH");
    // The real path has many vertices: never a straight line.
    const path = within(drawing).getByTestId("route-line").getAttribute("d");
    expect(path?.split("L").length).toBeGreaterThan(20);
    expect(track).toHaveBeenCalledWith("route_map_shown", {
      mode: "standard",
      hasGeometry: true,
    });

    // The recon captured no accessible IRB → VMH route.
    await user.click(
      screen.getByRole("button", {
        name: "Change your pace or use accessible routes",
      }),
    );
    await user.click(screen.getByRole("switch", { name: /Accessible routes/ }));
    act(() =>
      useUi.getState().drill({
        kind: "connection",
        connectionId: WITH_ROUTE,
      }),
    );
    expect(
      await screen.findByText("Map unavailable for this route"),
    ).toBeInTheDocument();
    expect(screen.getByText(/accessible route$/)).toBeInTheDocument();
  });

  it("previews a fixing section on hover, and switches to it", async () => {
    const { user } = await openConnection(TIGHT);
    const fixes = await screen.findByRole("region", {
      name: "Sections that fix this",
    });
    const fix = await within(fixes).findByTestId("fix-STAT400-0201");
    expect(fix).toHaveTextContent("STAT400 0201");
    expect(fix).toHaveTextContent("MWF 9am–9:50am");

    await user.hover(fix);
    expect(useUi.getState().hoverCourse).toBe("STAT400");
    expect(useUi.getState().previewSection).toBe("STAT400-0201");
    const calendar = screen.getByRole("region", { name: "Week calendar" });
    await waitFor(() =>
      expect(calendar.querySelector("[data-ghost]")).not.toBeNull(),
    );
    await user.unhover(fix);
    expect(useUi.getState().previewSection).toBeNull();
    expect(useUi.getState().hoverCourse).toBeNull();

    await user.click(
      within(fix).getByRole("button", { name: "Switch STAT400 to 0201" }),
    );
    expect(
      openPlanNow()?.courses.find((c) => c.courseCode === "STAT400")
        ?.sectionCode,
    ).toBe("0201");
    expect(await screen.findByText("Switched STAT400 to 0201")).toBeVisible();
    // The connection it described is gone, so the details close.
    expect(useUi.getState().stack).toEqual([]);
    expect(useUi.getState().previewSection).toBeNull();
  });

  it("says so when the connection left the plan", async () => {
    await openConnection("M:NOPE100-0101#0>CMSC351-0301#0");
    expect(
      await screen.findByText(/This connection isn't in the plan anymore/),
    ).toBeInTheDocument();
  });
});
