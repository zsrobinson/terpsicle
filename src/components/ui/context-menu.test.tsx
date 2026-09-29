import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./context-menu";

describe("ContextMenu", () => {
  it("opens on a right click on its row, and runs the item picked", async () => {
    const remove = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-course="CMSC216">CMSC216</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>More about this course</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={remove}>Remove</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    const row = screen.getByText("CMSC216");
    // asChild: the row itself is the trigger, marked closed until it opens.
    expect(row).toHaveAttribute("data-course", "CMSC216");
    expect(row).toHaveAttribute("data-state", "closed");
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-state", "open");
    await userEvent
      .setup()
      .click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(remove).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
