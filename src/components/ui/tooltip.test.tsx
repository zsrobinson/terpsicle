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

  it("stays shut when the app moves focus into a text field", () => {
    // "Add a task", a shortcut or a form opening puts the caret in a field:
    // the person didn't go looking for it, and the tooltip would cover the
    // heading above it (QA3 Todo).
    render(<Field />);
    const field = screen.getByRole("textbox");
    act(() => field.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("still opens when the app focuses a button", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <WithTooltip label="Back to Search" shortcut="Esc">
          <button type="button">Back</button>
        </WithTooltip>
      </TooltipProvider>,
    );
    act(() => screen.getByRole("button").focus());
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Back to Search",
    );
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
