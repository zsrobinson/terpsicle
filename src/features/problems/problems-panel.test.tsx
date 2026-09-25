import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { openPlanNow, renderPlanTab } from "~/features/courses/testing";
import { demoPlanB, fixtureTermId } from "~/fixtures";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

describe("Problems tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("lists problems by severity, calmly, with no banner", async () => {
    await renderPlanTab([panels], "problems");
    const warnings = await screen.findByRole("region", {
      name: "Worth a look",
    });
    expect(
      within(warnings).getByRole("button", {
        name: "CMSC330 and ENGL393 overlap",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Won't work as planned" }),
    ).toBeNull();
  });

  it("puts errors first (cancelled and changed sections in Plan B)", async () => {
    await renderPlanTab([panels], "problems");
    act(() =>
      useWorkspace.getState().activatePlan(fixtureTermId, demoPlanB.id),
    );
    const groups = await screen.findAllByRole("region");
    const labels = groups
      .map((g) => g.getAttribute("aria-label"))
      .filter((l) => l !== null && l !== "Week calendar");
    expect(labels[0]).toBe("Won't work as planned");
    // "Keep new times" for the moved section.
    expect(
      within(groups[0] as HTMLElement).getByRole("button", {
        name: /Keep new times/,
      }),
    ).toBeInTheDocument();
  });

  it("opens the related course", async () => {
    const { user } = await renderPlanTab([panels], "problems");
    await user.click(
      await screen.findByRole("button", {
        name: "CMSC351 0301 has 3 seats left",
      }),
    );
    expect(useUi.getState().stack.at(-1)).toEqual({
      kind: "course",
      courseCode: "CMSC351",
    });
    expect(track).toHaveBeenCalledWith("problem_opened", { kind: "few-seats" });
  });

  it("opens a tight connection's details", async () => {
    const { user } = await renderPlanTab([panels], "problems");
    await user.click(
      await screen.findByRole("button", {
        name: "Tight connection from STAT400 to CMSC351",
      }),
    );
    expect(useUi.getState().stack.at(-1)?.kind).toBe("connection");
  });

  it("applies a one-click fix, undoably", async () => {
    const { user } = await renderPlanTab([panels], "problems");
    const overlap = await screen.findByTestId("problem-overlap");
    const fix = within(overlap).getByRole("button", { name: /^Switch / });
    const label = fix.textContent ?? "";
    await user.click(fix);
    const switched = openPlanNow()?.courses.find(
      (c) => c.courseCode === "ENGL393",
    );
    expect(label).toContain(switched?.sectionCode ?? "?");
    expect(switched?.sectionCode).not.toBe("0101");
    await waitFor(() =>
      expect(screen.queryByTestId("problem-overlap")).toBeNull(),
    );
    expect(track).toHaveBeenCalledWith("problem_fix_applied", {
      kind: "switch",
      problem: "overlap",
    });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByTestId("problem-overlap")).toBeInTheDocument();
  });

  it("says so when there's nothing to fix", async () => {
    await renderPlanTab([panels], "problems", { demo: false });
    expect(await screen.findByText(/Nothing to check yet/)).toBeInTheDocument();
  });
});
