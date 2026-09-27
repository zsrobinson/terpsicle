import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
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
});
