import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { HapticTap, hapticTapSupported } from "./haptic";
import { SegmentedControl } from "./segmented-control";
import { Switch } from "./switch";
import { ToastAction } from "./toast";
import { TooltipProvider } from "./tooltip";

// The iPhone check reads the browser: pretend to be one by shadowing
// navigator's getters, and put them back after each test.
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15";
const shadowed: string[] = [];

function pretend(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { value, configurable: true });
    shadowed.push(key);
  }
}

const pretendIPhone = () =>
  pretend({ userAgent: IPHONE, maxTouchPoints: 5, vibrate: undefined });

afterEach(() => {
  for (const key of shadowed.splice(0)) Reflect.deleteProperty(navigator, key);
});

const overlays = (container: HTMLElement) =>
  container.querySelectorAll("input[data-haptic-tap]");

describe("hapticTapSupported", () => {
  it("is true on an iPhone only", () => {
    expect(hapticTapSupported()).toBe(false);
    pretendIPhone();
    expect(hapticTapSupported()).toBe(true);
  });

  it("is false on an iPad (which says Macintosh) and anything that vibrates", () => {
    pretend({ userAgent: IPAD, maxTouchPoints: 5, vibrate: undefined });
    expect(hapticTapSupported()).toBe(false);
    for (const key of shadowed.splice(0))
      Reflect.deleteProperty(navigator, key);
    pretend({ userAgent: IPHONE, maxTouchPoints: 5, vibrate: () => true });
    expect(hapticTapSupported()).toBe(false);
  });
});

describe("HapticTap", () => {
  it("renders nothing off an iPhone", () => {
    const { container } = render(
      <Button haptic onClick={() => {}}>
        Add 0101
      </Button>,
    );
    expect(overlays(container)).toHaveLength(0);
  });

  it("renders an invisible native switch inside its control on an iPhone", () => {
    pretendIPhone();
    render(
      <Button haptic onClick={() => {}}>
        Add 0101
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add 0101" });
    const overlay = button.querySelector("input[data-haptic-tap]");
    expect(overlay).toHaveAttribute("type", "checkbox");
    expect(overlay).toHaveAttribute("switch", "");
    expect(overlay).toHaveAttribute("tabindex", "-1");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveClass("absolute", "inset-0", "opacity-0");
    // Its host holds it: the overlay covers the whole control.
    expect(button).toHaveClass("relative");
    // No part of the name, and no extra control for a screen reader.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("sends a tap on the switch to the control's onClick exactly once", async () => {
    pretendIPhone();
    const onClick = vi.fn();
    render(
      <Button haptic onClick={onClick}>
        Add 0101
      </Button>,
    );
    const overlay = screen
      .getByRole("button", { name: "Add 0101" })
      .querySelector("input[data-haptic-tap]");
    if (!(overlay instanceof HTMLInputElement)) throw new Error("no overlay");
    await userEvent.setup().click(overlay);
    expect(onClick).toHaveBeenCalledOnce();
    // The switch itself toggled: that's the tick.
    expect(overlay.checked).toBe(true);
  });

  it("leaves the keyboard alone: Enter and Space press the control once each", async () => {
    pretendIPhone();
    const onClick = vi.fn();
    render(
      <Button haptic onClick={onClick}>
        Add 0101
      </Button>,
    );
    const user = userEvent.setup();
    await user.tab();
    const button = screen.getByRole("button", { name: "Add 0101" });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
    const overlay = button.querySelector("input[data-haptic-tap]");
    expect(overlay).not.toBeChecked();
    // Tab never stops on the overlay.
    await user.tab();
    expect(overlay).not.toHaveFocus();
  });

  it("toggles a Switch once through its overlay", async () => {
    pretendIPhone();
    function Accessible({ onChange }: { onChange: (on: boolean) => void }) {
      const [on, setOn] = useState(false);
      return (
        <Switch
          checked={on}
          onCheckedChange={(next) => {
            onChange(next);
            setOn(next);
          }}
        >
          Accessible routes
        </Switch>
      );
    }
    const onChange = vi.fn();
    render(<Accessible onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Accessible routes" });
    const overlay = toggle.querySelector("input[data-haptic-tap]");
    if (!(overlay instanceof HTMLInputElement)) throw new Error("no overlay");
    await userEvent.setup().click(overlay);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(toggle).toBeChecked();
  });

  it("chooses a segment once through its overlay, and the current one has none", async () => {
    pretendIPhone();
    function Pace({ onChange }: { onChange: (pace: string) => void }) {
      const [pace, setPace] = useState("typical");
      return (
        <SegmentedControl
          label="Your pace"
          value={pace}
          onValueChange={(next) => {
            onChange(next);
            setPace(next);
          }}
          options={[
            { value: "slower", label: "Slower" },
            { value: "typical", label: "Typical" },
          ]}
        />
      );
    }
    const onChange = vi.fn();
    render(
      <TooltipProvider>
        <Pace onChange={onChange} />
      </TooltipProvider>,
    );
    const typical = screen.getByRole("radio", { name: "Typical" });
    const slower = screen.getByRole("radio", { name: "Slower" });
    expect(typical.querySelector("input[data-haptic-tap]")).toBeNull();
    const overlay = slower.querySelector("input[data-haptic-tap]");
    if (!(overlay instanceof HTMLInputElement)) throw new Error("no overlay");
    await userEvent.setup().click(overlay);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("slower");
    expect(slower).toBeChecked();
    expect(slower.querySelector("input[data-haptic-tap]")).toBeNull();
    expect(typical.querySelector("input[data-haptic-tap]")).not.toBeNull();
  });

  it("is on for ToastAction and Switch, off for Button unless asked", () => {
    pretendIPhone();
    const { container } = render(
      <TooltipProvider>
        <ToastAction label="Undo" onClick={() => {}} />
        <Switch checked={false} onCheckedChange={() => {}}>
          Quiet hours
        </Switch>
        <Button>Save</Button>
        <Button haptic={false}>Cancel</Button>
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Undo" }).querySelector("input"),
    ).not.toBeNull();
    expect(
      screen
        .getByRole("switch", { name: "Quiet hours" })
        .querySelector("input"),
    ).not.toBeNull();
    expect(overlays(container)).toHaveLength(2);
  });

  it("carries a render element's own children, with the overlay after them", () => {
    pretendIPhone();
    render(
      <Button haptic asChild>
        <a href="/plan">Open Plan</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Open Plan" });
    expect(link).toHaveClass("relative");
    expect(link.lastElementChild).toHaveAttribute("data-haptic-tap");
  });

  // axe's nested-interactive rule flags the trick itself: a switch inside a
  // button, radio or switch, whose children are presentational. It can't be
  // avoided (the finger has to land on a real switch, and the control has to
  // hold it), so it's contained instead: aria-hidden and tabindex -1, so
  // neither a screen reader nor the keyboard ever reaches it (axe's
  // "notHidden" message: it can't see that aria-hidden works here), and only
  // on an iPhone, so the e2e scans never meet it. This pins the finding to
  // exactly the overlays, and every other rule passes with them present.
  it("passes axe with the overlay present, but for the overlay's own nesting", async () => {
    pretendIPhone();
    const { container } = render(
      <TooltipProvider>
        <main>
          <Button haptic>Add 0101</Button>
          <Switch checked onCheckedChange={() => {}}>
            Accessible routes
          </Switch>
          <SegmentedControl
            label="Your pace"
            value="typical"
            onValueChange={() => {}}
            options={[
              { value: "slower", label: "Slower" },
              { value: "typical", label: "Typical" },
            ]}
          />
          <ToastAction label="Undo" onClick={() => {}} />
        </main>
      </TooltipProvider>,
    );
    expect(overlays(container)).toHaveLength(4);
    const results = await axe.run(container, {
      // Color and layout need a real browser (e2e/axe.ts runs those).
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual(["nested-interactive"]);
    const nested = results.violations[0]?.nodes ?? [];
    // One finding per control, and what's nested in each is its overlay.
    expect(nested).toHaveLength(4);
    for (const node of nested) {
      const related = node.any.flatMap((check) => check.relatedNodes ?? []);
      expect(related.map((r) => r.html)).toEqual([
        expect.stringContaining("data-haptic-tap"),
      ]);
    }
  });
});

// HapticTap on its own: the smallest host, for the parts above that aren't
// about any one control.
describe("HapticTap in a plain host", () => {
  it("focuses its host on a tap, as a tap on the host would", async () => {
    pretendIPhone();
    render(
      <button type="button" className="relative">
        Plain
        <HapticTap />
      </button>,
    );
    const host = screen.getByRole("button", { name: "Plain" });
    const overlay = host.querySelector("input");
    if (!(overlay instanceof HTMLInputElement)) throw new Error("no overlay");
    await userEvent.setup().click(overlay);
    expect(host).toHaveFocus();
  });
});
