import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";
import { TooltipProvider } from "./tooltip";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1";
const shadowed: string[] = [];

function pretendIPhone() {
  const values = { userAgent: IPHONE, maxTouchPoints: 5, vibrate: undefined };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
    shadowed.push(key);
  }
}

afterEach(() => {
  for (const key of shadowed.splice(0)) Reflect.deleteProperty(navigator, key);
});

function Lab({ haptic = false, onChange = () => {} }) {
  const [done, setDone] = useState(false);
  return (
    <TooltipProvider delayDuration={0}>
      <Checkbox
        tooltip="Mark done"
        aria-label="Done: Lab 5"
        checked={done}
        haptic={haptic}
        onChange={() => {
          onChange();
          setDone((d) => !d);
        }}
        className="size-11"
      />
    </TooltipProvider>
  );
}

describe("Checkbox", () => {
  it("is a native checkbox in a bigger target, with its tooltip", async () => {
    render(<Lab />);
    const box = screen.getByRole("checkbox", { name: "Done: Lab 5" });
    expect(box.closest("label")).toHaveClass("size-11", "cursor-pointer");
    const user = userEvent.setup();
    await user.hover(box);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Mark done");
    await user.click(box);
    expect(box).toBeChecked();
  });

  it("has no tick off an iPhone", () => {
    const { container } = render(<Lab haptic />);
    expect(container.querySelector("input[data-haptic-tap]")).toBeNull();
  });

  it("ticks on an iPhone: a tap on the overlay checks the box once", () => {
    pretendIPhone();
    const onChange = vi.fn();
    const { container } = render(<Lab haptic onChange={onChange} />);
    const overlay = container.querySelector("input[data-haptic-tap]");
    if (!(overlay instanceof HTMLInputElement)) throw new Error("no overlay");
    // Inside the target, covering it.
    expect(overlay.parentElement).toBe(
      screen.getByRole("checkbox", { name: "Done: Lab 5" }).closest("label"),
    );
    expect(overlay.parentElement).toHaveClass("relative");
    fireEvent.click(overlay);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "Done: Lab 5" })).toBeChecked();
  });
});
