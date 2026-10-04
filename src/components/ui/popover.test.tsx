import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  pressedOn,
} from "./popover";
import { TooltipProvider, WithTooltip } from "./tooltip";

describe("PopoverContent", () => {
  it("closes on the first Esc, though what it focuses has a tooltip", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Popover>
          <PopoverTrigger>Colors</PopoverTrigger>
          <PopoverContent aria-label="Course colors">
            <WithTooltip label="Violet">
              <button type="button">Violet</button>
            </WithTooltip>
          </PopoverContent>
        </Popover>
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Enter}");
    const violet = await screen.findByRole("button", { name: "Violet" });
    await waitFor(() => expect(violet).toHaveFocus());
    // No tooltip over the palette as it opens, to take the Esc.
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Course colors" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Colors" })).toHaveFocus();
  });

  it("points at a virtual anchor, and a press on it isn't a click away", async () => {
    // The bell's shape: its own button toggles the popover, which points at
    // it through `virtualRef` and ignores presses on it.
    function Bell() {
      const [open, setOpen] = useState(false);
      const bell = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={bell} type="button" onClick={() => setOpen(!open)}>
            Notifications
          </button>
          <button type="button">Elsewhere</button>
          <Popover
            open={open}
            onOpenChange={(next, details) => {
              if (pressedOn(bell, details)) details.cancel();
              else setOpen(next);
            }}
          >
            <PopoverAnchor virtualRef={bell} />
            <PopoverContent aria-label="Inbox">Nothing new.</PopoverContent>
          </Popover>
        </>
      );
    }
    render(<Bell />);
    const user = userEvent.setup();
    const bell = screen.getByRole("button", { name: "Notifications" });
    await user.click(bell);
    expect(
      await screen.findByRole("dialog", { name: "Inbox" }),
    ).toBeInTheDocument();
    // The bell closes it (its own click), rather than closing and reopening.
    await user.click(bell);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Inbox" })).toBeNull(),
    );
    await user.click(bell);
    await screen.findByRole("dialog", { name: "Inbox" });
    // Anywhere else closes it.
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Inbox" })).toBeNull(),
    );
  });

  it("puts focus where initialFocus says, not on the first button", async () => {
    function NewBlock() {
      const field = useRef<HTMLInputElement>(null);
      return (
        <Popover defaultOpen>
          <PopoverTrigger>New block</PopoverTrigger>
          <PopoverContent aria-label="New block" initialFocus={field}>
            <button type="button">Lunch</button>
            <input ref={field} aria-label="Label" />
          </PopoverContent>
        </Popover>
      );
    }
    render(<NewBlock />);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Label" })).toHaveFocus(),
    );
  });

  it("draws its anchor as the element its render prop gives", async () => {
    render(
      <Popover defaultOpen>
        <PopoverAnchor render={<span data-testid="outline" />} />
        <PopoverContent aria-label="New block">Lunch</PopoverContent>
      </Popover>,
    );
    expect(screen.getByTestId("outline").tagName).toBe("SPAN");
    expect(
      await screen.findByRole("dialog", { name: "New block" }),
    ).toBeInTheDocument();
  });
});
