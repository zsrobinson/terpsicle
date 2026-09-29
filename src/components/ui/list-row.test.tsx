import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupHeader, ListRow } from "./list-row";
import { TooltipProvider } from "./tooltip";

// The kit's row and group bar. src/components/panel.test.tsx covers what the
// scheduler's panels rely on (it imports them through ~/components/panel).

describe("ListRow", () => {
  it("puts the secondary line under the primary one and lines the columns up at the top", () => {
    render(
      <ListRow
        align="start"
        lead={<span>CMSC351</span>}
        secondary="Algorithms · J. Whitfield"
        trail="11 of 120 open"
      >
        0201
      </ListRow>,
    );
    const secondary = screen.getByText("Algorithms · J. Whitfield");
    expect(secondary).toHaveClass("emph-secondary", "text-sm");
    expect(secondary.previousSibling).toHaveTextContent("0201");
    const row = secondary.parentElement?.parentElement;
    expect(row).toHaveClass("items-start", "border-b", "px-4", "py-2");
    expect(row).toHaveTextContent(
      "CMSC3510201Algorithms · J. Whitfield11 of 120 open",
    );
  });

  it("centers one-line rows, and the selected one is accent-soft", () => {
    render(<ListRow state="current">Section 0103</ListRow>);
    const row = screen.getByText("Section 0103").parentElement;
    expect(row).toHaveClass("items-center", "bg-accent-soft");
    expect(row).toHaveAttribute("data-state", "current");
  });
});

describe("GroupHeader", () => {
  it("is a plain tinted 30px bar with a heading when it doesn't collapse", () => {
    render(<GroupHeader headingLevel={3} title="CMSC216" meta="142 people" />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("CMSC216142 people");
    expect(heading.parentElement).toHaveClass("h-7.5", "bg-panel");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("collapses from its left part when it has a toggle", async () => {
    const onToggle = vi.fn();
    render(
      <TooltipProvider>
        <GroupHeader
          open={false}
          onToggle={onToggle}
          toggleLabel="Show Grace Kowalczyk's sections"
          title="Grace Kowalczyk"
        />
      </TooltipProvider>,
    );
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle).toHaveTextContent("Grace Kowalczyk");
    await userEvent.setup().click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
