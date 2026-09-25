import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { renderPlanTab } from "~/features/courses/testing";
import { useWorkspace } from "~/state/workspace-store";
import { blockProblem } from "./block-form";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const blocks = () => useWorkspace.getState().blocks;

/** Opens a time select in the form and picks an option ("5pm"). */
async function pickTime(
  user: { click: (element: Element) => Promise<void> },
  form: HTMLElement,
  label: string,
  time: string,
) {
  await user.click(within(form).getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: time }));
}

/** "Add a block" opens the form (it starts closed when there are blocks). */
async function openForm(user: { click: (element: Element) => Promise<void> }) {
  await user.click(await screen.findByRole("button", { name: "Add a block" }));
  return screen.getByRole("form", { name: "Add block" });
}

describe("Blocks tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
  });

  it("lists the term's blocks first and explains what they do", async () => {
    await renderPlanTab([panels], "blocks");
    const list = await screen.findByRole("list", { name: "Blocks" });
    expect(within(list).getByText("Work")).toBeInTheDocument();
    expect(within(list).getByText("Fri · 1pm–4pm")).toBeInTheDocument();
    // The form waits behind "Add a block" while there are blocks to list.
    expect(screen.queryByRole("form", { name: "Add block" })).toBeNull();
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
    const form = await openForm(user);
    // Days are toggles that fill when on, like Generate's.
    expect(within(form).getByRole("button", { name: "Mon" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(form).getByRole("button", { name: "Gym" }));
    await user.click(within(form).getByRole("button", { name: "Fri" }));
    await pickTime(user, form, "Starts", "5pm");
    await pickTime(user, form, "Ends", "6:30pm");
    await user.click(within(form).getByRole("button", { name: "Add block" }));
    const gym = blocks().find((b) => b.label === "Gym");
    expect(gym).toMatchObject({
      days: ["M", "W", "F"],
      start: 1020,
      end: 1110,
    });
    expect(track).toHaveBeenCalledWith("block_created", { via: "form" });
    // The form clears for the next one, and stays open for it.
    expect(within(form).getByLabelText("Label")).toHaveValue("");
    expect(screen.getByRole("form", { name: "Add block" })).toBe(form);
  });

  it("won't add a block that ends before it starts", async () => {
    const { user } = await renderPlanTab([panels], "blocks");
    const form = await openForm(user);
    await user.type(within(form).getByLabelText("Label"), "Practice");
    await pickTime(user, form, "Ends", "11am");
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

describe("Blocks tab with no blocks", () => {
  it("shows the form straight away", async () => {
    await renderPlanTab([panels], "blocks", { demo: false });
    expect(
      await screen.findByRole("form", { name: "Add block" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Blocks" })).toBeNull();
  });
});
