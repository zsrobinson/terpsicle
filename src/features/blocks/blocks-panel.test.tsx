import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderPlanTab } from "~/features/courses/testing";
import { useWorkspace } from "~/state/workspace-store";
import { blockProblem } from "./block-form";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const blocks = () => useWorkspace.getState().blocks;

describe("Blocks tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("lists the term's blocks and explains what they do", async () => {
    await renderPlanTab([panels], "blocks");
    const list = await screen.findByRole("list", { name: "Blocks" });
    expect(within(list).getByText("Work")).toBeInTheDocument();
    expect(within(list).getByText("Fri · 1pm–4pm")).toBeInTheDocument();
    expect(
      screen.getByText(
        /count as busy time for Fits my plan, Problems and Generate/,
      ),
    ).toBeInTheDocument();
    // No place field, ever.
    expect(screen.queryByRole("combobox", { name: /place/i })).toBeNull();
    expect(screen.queryByText(/travel time/i)).toBeNull();
  });

  it("adds a block from the form with a preset", async () => {
    const { user } = await renderPlanTab([panels], "blocks");
    const form = await screen.findByRole("form", { name: "Add block" });
    await user.click(within(form).getByRole("button", { name: "Gym" }));
    await user.click(within(form).getByRole("button", { name: "Fri" }));
    await user.selectOptions(within(form).getByLabelText("Starts"), "1020");
    await user.selectOptions(within(form).getByLabelText("Ends"), "1110");
    await user.click(within(form).getByRole("button", { name: "Add block" }));
    const gym = blocks().find((b) => b.label === "Gym");
    expect(gym).toMatchObject({
      days: ["M", "W", "F"],
      start: 1020,
      end: 1110,
    });
    expect(track).toHaveBeenCalledWith("block_created", { via: "form" });
    // The form clears for the next one.
    expect(within(form).getByLabelText("Label")).toHaveValue("");
  });

  it("won't add a block that ends before it starts", async () => {
    const { user } = await renderPlanTab([panels], "blocks");
    const form = await screen.findByRole("form", { name: "Add block" });
    await user.type(within(form).getByLabelText("Label"), "Practice");
    await user.selectOptions(within(form).getByLabelText("Ends"), "660");
    expect(
      within(form).getByRole("button", { name: "Add block" }),
    ).toBeDisabled();
    expect(within(form).getByText("End after it starts.")).toBeInTheDocument();
  });

  it("edits and removes blocks, undoably", async () => {
    const { user } = await renderPlanTab([panels], "blocks");
    await user.click(await screen.findByRole("button", { name: "Edit Work" }));
    const edit = screen.getByRole("form", { name: "Save block" });
    const label = within(edit).getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Shift");
    await user.click(within(edit).getByRole("button", { name: "Save block" }));
    expect(blocks().map((b) => b.label)).toEqual(["Shift"]);

    await user.click(screen.getByRole("button", { name: "Remove Shift" }));
    expect(blocks()).toEqual([]);
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(blocks().map((b) => b.label)).toEqual(["Shift"]),
    );
  });

  it("words what's missing", () => {
    const base = { label: "Lunch", days: ["M" as const], start: 720, end: 780 };
    expect(blockProblem(base)).toBeNull();
    expect(blockProblem({ ...base, label: " " })).toBe("Add a label.");
    expect(blockProblem({ ...base, days: [] })).toBe("Pick at least one day.");
    expect(blockProblem({ ...base, end: 720 })).toBe("End after it starts.");
  });
});
