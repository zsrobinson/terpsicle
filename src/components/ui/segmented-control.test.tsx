import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control";
import { TooltipProvider } from "./tooltip";

type Pace = "slower" | "typical" | "faster";

function Pace({ onChange }: { onChange?: (pace: Pace) => void }) {
  const [pace, setPace] = useState<Pace>("typical");
  return (
    <TooltipProvider delayDuration={0}>
      <SegmentedControl
        label="Your pace"
        value={pace}
        onValueChange={(next) => {
          onChange?.(next);
          setPace(next);
        }}
        options={[
          {
            value: "slower",
            label: "Slower",
            ariaLabel: "Slower, 2.5 mph",
            hint: "Walk at 2.5 mph",
          },
          { value: "typical", label: "Typical" },
          { value: "faster", label: "Faster" },
        ]}
      />
    </TooltipProvider>
  );
}

describe("SegmentedControl", () => {
  it("is a named radio group with the current choice checked", () => {
    render(<Pace />);
    const group = screen.getByRole("radiogroup", { name: "Your pace" });
    expect(group).toHaveClass("h-11", "md:h-7", "border-hairline-strong");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Typical" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Slower, 2.5 mph" }),
    ).not.toBeChecked();
  });

  it("chooses on click, and choosing the current one again keeps it", async () => {
    const onChange = vi.fn();
    render(<Pace onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Faster" }));
    expect(onChange).toHaveBeenLastCalledWith("faster");
    expect(screen.getByRole("radio", { name: "Faster" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Faster" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByRole("radio", { name: "Faster" })).toBeChecked();
  });

  it("takes one Tab stop, and arrow keys move and choose, as radios do", async () => {
    const onChange = vi.fn();
    render(<Pace onChange={onChange} />);
    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("radio", { name: "Typical" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    const faster = screen.getByRole("radio", { name: "Faster" });
    expect(faster).toHaveFocus();
    expect(faster).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith("faster");
    await user.tab();
    expect(document.body).toHaveFocus();
  });

  it("shows a segment's hint as its tooltip", async () => {
    render(<Pace />);
    await userEvent
      .setup()
      .hover(screen.getByRole("radio", { name: "Slower, 2.5 mph" }));
    expect(
      await screen.findByRole("tooltip", { name: "Walk at 2.5 mph" }),
    ).toBeInTheDocument();
  });
});
