import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Severity } from "~/core/schema/problems";
import { TooltipProvider } from "~/ui/tooltip";
import {
  ProblemAction,
  ProblemFixButton,
  ProblemList,
  ProblemRow,
  ProblemsClear,
} from "./problem-list";

// The problem list Schedule's Problems tab and Plan's Problems view share:
// the same bands, marks, rows and buttons in both.

interface Item {
  id: string;
  severity: Severity;
  title: string;
}

const items: Item[] = [
  { id: "a", severity: "info", title: "CMSC351 0101 has no set time" },
  { id: "b", severity: "warning", title: "CMSC330 and ENGL393 overlap" },
  { id: "c", severity: "error", title: "STAT400 0201 was cancelled" },
  { id: "d", severity: "warning", title: "Tight connection to CMSC351" },
];

function renderList(onOpen = vi.fn(), onApply = vi.fn()) {
  render(
    <TooltipProvider delayDuration={0}>
      <ProblemList
        problems={items}
        row={(item) => (
          <ProblemRow
            key={item.id}
            severity={item.severity}
            title={item.title}
            openLabel="Open it"
            onOpen={() => onOpen(item.id)}
            detail="Some detail"
            testId={`problem-${item.id}`}
            actions={
              item.id === "b" ? (
                <>
                  <ProblemFixButton
                    label="Switch ENGL393 to FC01"
                    onApply={onApply}
                  />
                  <ProblemAction tooltip="Say more" onClick={vi.fn()}>
                    Add course info
                  </ProblemAction>
                </>
              ) : null
            }
          />
        )}
      />
    </TooltipProvider>,
  );
}

describe("ProblemList", () => {
  it("groups by severity, most serious first, under the same bands with counts", () => {
    renderList();
    const regions = screen.getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Won't work as planned",
      "Worth a look",
      "Good to know",
    ]);
    const warnings = screen.getByRole("region", { name: "Worth a look" });
    expect(
      within(warnings).getByRole("heading", { name: "Worth a look" }),
    ).toBeVisible();
    expect(within(warnings).getByText("2")).toBeVisible();
    expect(within(warnings).getAllByRole("listitem")).toHaveLength(2);
    // No banner, nothing that interrupts.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("leaves out a severity with nothing in it", () => {
    render(
      <ProblemList
        problems={items.filter((i) => i.severity === "info")}
        row={(item) => (
          <ProblemRow
            key={item.id}
            severity={item.severity}
            title={item.title}
            openLabel="Open it"
            onOpen={vi.fn()}
          />
        )}
      />,
    );
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region", { name: "Good to know" })).toBeVisible();
  });
});

describe("ProblemRow", () => {
  it("opens from its title, and keeps the fix first in its row of buttons", async () => {
    const onOpen = vi.fn();
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderList(onOpen, onApply);
    const row = screen.getByTestId("problem-b");
    await user.click(
      within(row).getByRole("button", { name: "CMSC330 and ENGL393 overlap" }),
    );
    expect(onOpen).toHaveBeenCalledWith("b");
    const buttons = within(row).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "CMSC330 and ENGL393 overlap",
      "Switch ENGL393 to FC01",
      "Add course info",
    ]);
    const fix = within(row).getByRole("button", {
      name: "Switch ENGL393 to FC01",
    });
    await user.hover(fix);
    expect(
      await screen.findByRole("tooltip", {
        name: "Switch ENGL393 to FC01. You can undo this.",
      }),
    ).toBeInTheDocument();
    await user.click(fix);
    expect(onApply).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("marks each severity with its own icon, in the severity's ink", () => {
    renderList();
    const mark = (id: string) =>
      screen.getByTestId(`problem-${id}`).querySelector("svg");
    expect(mark("c")).toHaveClass("text-error");
    expect(mark("b")).toHaveClass("text-warn");
    expect(mark("a")).toHaveClass("text-muted");
  });
});

describe("ProblemsClear", () => {
  it("says so calmly, with a check", () => {
    render(<ProblemsClear>Nothing to fix. This plan works.</ProblemsClear>);
    const note = screen.getByText("Nothing to fix. This plan works.");
    expect(note.parentElement?.querySelector("svg")).toHaveClass("text-ok");
  });
});
