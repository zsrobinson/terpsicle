import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

function Accessible({ onChange }: { onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      checked={on}
      onCheckedChange={(next) => {
        onChange?.(next);
        setOn(next);
      }}
    >
      Accessible routes
    </Switch>
  );
}

describe("Switch", () => {
  it("is a switch named by its label, and the whole row toggles it", async () => {
    const onChange = vi.fn();
    render(<Accessible onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Accessible routes" });
    expect(toggle).not.toBeChecked();
    await userEvent.setup().click(screen.getByText("Accessible routes"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(toggle).toBeChecked();
  });

  it("stays off and focusable while unavailable, so its tooltip can say why", async () => {
    const onChange = vi.fn();
    render(
      <Switch
        checked
        unavailable
        aria-label="Seat openings: Text"
        onCheckedChange={onChange}
      >
        Text
      </Switch>,
    );
    const toggle = screen.getByRole("switch", { name: "Seat openings: Text" });
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).not.toBeChecked();
    expect(toggle).not.toBeDisabled();
    await userEvent.setup().click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
