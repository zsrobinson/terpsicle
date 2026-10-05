import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

function Chip({ onClick = () => {} }: { onClick?: () => void }) {
  return (
    <TooltipProvider delayDuration={0}>
      <WithTooltip
        label="Latest first class of the day"
        card={<p>Your top plan: 10am avg start</p>}
      >
        <button type="button" onClick={onClick}>
          Later starts
        </button>
      </WithTooltip>
    </TooltipProvider>
  );
}

// A finger's touch keeps tooltips shut for a second (module state, real
// time), so everything that opens one by the keyboard runs before the
// touch tests, which come last.
describe("WithTooltip with a card", () => {
  it("shows the card under its words when the keyboard focuses the control", async () => {
    render(<Chip />);
    await userEvent.setup().tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Latest first class of the day");
    expect(tip).toHaveTextContent("Your top plan: 10am avg start");
  });
});

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

describe("WithTooltip with a card, by touch", () => {
  it("opens when a finger holds the control, and the hold isn't a tap", () => {
    vi.useFakeTimers();
    try {
      let taps = 0;
      render(<Chip onClick={() => taps++} />);
      const chip = screen.getByRole("button");
      fireEvent.pointerDown(chip, { pointerType: "touch" });
      act(() => vi.advanceTimersByTime(600));
      fireEvent.pointerUp(chip, { pointerType: "touch" });
      fireEvent.click(chip);
      expect(screen.getByRole("tooltip")).toHaveTextContent("Your top plan");
      expect(taps).toBe(0);
      // A quick tap afterwards still toggles it.
      fireEvent.pointerDown(chip, { pointerType: "touch" });
      fireEvent.pointerUp(chip, { pointerType: "touch" });
      fireEvent.click(chip);
      expect(taps).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't open when the finger moves on, as a scroll does", () => {
    vi.useFakeTimers();
    try {
      render(<Chip />);
      const chip = screen.getByRole("button");
      fireEvent.pointerDown(chip, {
        pointerType: "touch",
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(chip, {
        pointerType: "touch",
        clientX: 10,
        clientY: 40,
      });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
