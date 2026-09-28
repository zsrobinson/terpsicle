import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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
    expect(trigger()).toHaveAttribute("data-state", "closed");
  });

  it("opens a list under the trigger and picks from it", async () => {
    render(<Term />);
    const user = userEvent.setup();
    await user.click(trigger());
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("data-state", "open");
    await user.click(screen.getByRole("option", { name: "Spring 2027" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger()).toHaveTextContent("Spring 2027");
    expect(screen.getByRole("status")).toHaveTextContent("202701");
    expect(trigger()).toHaveFocus();
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
