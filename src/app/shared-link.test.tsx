import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { archivedFixtureTermId, aSharePayload, mockCourse } from "~/fixtures";
import { plansInTerm } from "~/state/plan-ops";
import { encodeSharePayload } from "~/state/share-codec";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { track } from "./analytics";
import { renderShell } from "./test-utils";

vi.mock("./analytics", () => ({ track: vi.fn() }));

// The archived term, so the link's term differs from the default one.
const TERM = archivedFixtureTermId;

async function sharedLink() {
  return encodeSharePayload(
    aSharePayload({ termId: TERM, sections: ["CMSC131-0101"] }),
  );
}

describe("shared link view", () => {
  it("shows the pill in place of the plan tabs, and changes nothing", async () => {
    const onClearShared = vi.fn();
    await renderShell({ sharedParam: await sharedLink(), onClearShared });
    expect(await screen.findByText("Shared plan")).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "Plans" })).toBeNull();
    // The link's term shows, but the person's last term isn't changed.
    expect(await screen.findByText("Summer 2026")).toBeVisible();
    // Credits count the shared plan's courses.
    const credits = mockCourse("CMSC131", TERM).credits.min;
    expect(await screen.findByText(String(credits))).toBeVisible();
    expect(useUi.getState().lastTermId).toBeNull();
    expect(useWorkspace.getState().plans).toEqual([]);
    expect(track).toHaveBeenCalledWith("shared_link_opened", { outcome: "ok" });
  });

  it("Save a copy makes a plan and clears the link", async () => {
    const onClearShared = vi.fn();
    const { user } = await renderShell({
      sharedParam: await sharedLink(),
      onClearShared,
    });
    await user.click(
      await screen.findByRole("button", { name: "Save a copy" }),
    );
    await waitFor(() => expect(onClearShared).toHaveBeenCalled());
    const plans = plansInTerm(useWorkspace.getState().plans, TERM);
    expect(plans).toMatchObject([
      { courses: [{ courseCode: "CMSC131", sectionCode: "0101" }] },
    ]);
    expect(track).toHaveBeenCalledWith("shared_plan_saved", {
      droppedSections: 0,
    });
  });

  it("✕ goes back to your plans", async () => {
    const onClearShared = vi.fn();
    const { user, setProps } = await renderShell({
      sharedParam: await sharedLink(),
      onClearShared,
    });
    await user.click(
      await screen.findByRole("button", { name: "Close shared plan" }),
    );
    expect(onClearShared).toHaveBeenCalled();
    setProps({ onClearShared });
    expect(await screen.findByRole("tab", { name: "Plan A" })).toBeVisible();
  });

  it("a broken link says so and returns to your plans", async () => {
    const onClearShared = vi.fn();
    await renderShell({ sharedParam: "garbage", onClearShared });
    expect(
      await screen.findByText(/incomplete or damaged/),
    ).toBeInTheDocument();
    expect(onClearShared).toHaveBeenCalled();
  });
});
