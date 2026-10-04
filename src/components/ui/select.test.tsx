import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Input } from "./input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { TooltipProvider, WithTooltip } from "./tooltip";

const TERMS = [
  { value: "202608", label: "Fall 2026" },
  { value: "202701", label: "Spring 2027" },
];

function Term() {
  const [term, setTerm] = useState("202608");
  return (
    <TooltipProvider delayDuration={0}>
      <label htmlFor="term">Term</label>
      <Select value={term} onValueChange={setTerm}>
        <WithTooltip label="The term to show">
          <SelectTrigger id="term">
            <SelectValue />
          </SelectTrigger>
        </WithTooltip>
        <SelectContent>
          {TERMS.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <output>{term}</output>
    </TooltipProvider>
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Term" });

describe("Select", () => {
  it("shows the chosen item's label, not its value", () => {
    render(<Term />);
    expect(trigger()).toHaveTextContent("Fall 2026");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens a list under the trigger and picks from it", async () => {
    render(<Term />);
    const user = userEvent.setup();
    await user.click(trigger());
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("option", { name: "Spring 2027" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger()).toHaveTextContent("Spring 2027");
    expect(screen.getByRole("status")).toHaveTextContent("202701");
    expect(trigger()).toHaveFocus();
  });

  it("leaves the page usable while open: a press outside closes it and lands", async () => {
    // Not modal (as the kit's menus). The fade that made a modal select
    // swallow the next field's press doesn't run here; e2e/plan-tabs.spec.ts
    // ("add a block from the Blocks form") catches that in a browser.
    let pressed = 0;
    render(
      <>
        <Term />
        <button type="button" onClick={() => pressed++}>
          Ends
        </button>
      </>,
    );
    const user = userEvent.setup();
    await user.click(trigger());
    await screen.findByRole("listbox");
    await user.click(screen.getByRole("button", { name: "Ends" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(pressed).toBe(1);
  });

  it("works from the keyboard", async () => {
    render(<Term />);
    const user = userEvent.setup();
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Spring 2027" })).toHaveFocus(),
    );
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger()).toHaveTextContent("Spring 2027");
  });
});

/**
 * The height a control's classes give it on a desktop (768px and up) and on
 * a phone: `md:`/`max-md:` over the plain class, with a Select's size scope.
 */
function heights(el: HTMLElement, size = "default") {
  const classes = el.className.split(/\s+/);
  const find = (prefix: string) =>
    classes
      .map((c) =>
        new RegExp(`^${prefix}(?:data-\\[size=${size}\\]:)?h-(\\d+)$`).exec(c),
      )
      .find(Boolean)?.[1];
  const plain = find("");
  return {
    desktop: find("md:") ?? plain,
    phone: find("max-md:") ?? plain,
  };
}

describe("Select's height", () => {
  it("matches the Input and Button beside it, on a desktop and on a phone", () => {
    render(
      <>
        <Input aria-label="Name" />
        <Button>Add task</Button>
        <Button size="sm">Small</Button>
        <Select value="202608">
          <SelectTrigger aria-label="Term">
            <SelectValue />
          </SelectTrigger>
          <SelectContent />
        </Select>
        <Select value="202608">
          <SelectTrigger aria-label="Small term" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent />
        </Select>
      </>,
    );
    const input = heights(screen.getByRole("textbox", { name: "Name" }));
    const button = heights(screen.getByRole("button", { name: "Add task" }));
    const small = heights(screen.getByRole("button", { name: "Small" }));
    const select = heights(screen.getByRole("combobox", { name: "Term" }));
    const smallSelect = heights(
      screen.getByRole("combobox", { name: "Small term" }),
      "sm",
    );
    expect(input).toEqual({ desktop: "8", phone: "11" });
    expect(button).toEqual(input);
    expect(select).toEqual(input);
    expect(smallSelect).toEqual(small);
  });
});
