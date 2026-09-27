import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider, WithTooltip } from "./tooltip";

function Field() {
  return (
    <TooltipProvider delayDuration={0}>
      <WithTooltip label="Search by course code" shortcut="/">
        <input aria-label="Search courses" />
      </WithTooltip>
    </TooltipProvider>
  );
}

describe("WithTooltip", () => {
  it("opens when the keyboard focuses its control", async () => {
    render(<Field />);
    await userEvent.setup().tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Search by course code",
    );
  });

  it("closes once you type, so it never sits over what you're doing", async () => {
    render(<Field />);
    const user = userEvent.setup();
    await user.tab();
    await screen.findByRole("tooltip");
    await user.keyboard("cmsc");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("textbox")).toHaveValue("cmsc");
  });

  it("stays shut when a finger's tap focuses its control", () => {
    render(<Field />);
    const field = screen.getByRole("textbox");
    // A tap: the finger comes down, then the field takes focus.
    fireEvent.pointerDown(field, { pointerType: "touch" });
    act(() => field.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
