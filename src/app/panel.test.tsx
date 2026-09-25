import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import {
  EmptyState,
  GroupHeader,
  ListRow,
  PanelFooter,
  PanelLabel,
  SectionHeader,
} from "./panel";

// The shared panel anatomy (docs/UX-REVIEW.md §2.3): what features rely on.

describe("SectionHeader", () => {
  it("shows a title, a count and its controls in a bar that can stick", () => {
    render(
      <SectionHeader
        title="Sections"
        count="3 of 14 fit"
        right={<button type="button">Only fits</button>}
        sticky
      />,
    );
    const title = screen.getByRole("heading", { name: "Sections" });
    const bar = title.parentElement;
    expect(bar).toHaveTextContent("Sections3 of 14 fitOnly fits");
    expect(bar).toHaveClass("sticky", "top-0", "h-9");
  });

  it("has a quiet label form, which PanelLabel is", () => {
    const { container } = render(<PanelLabel>Saved for later</PanelLabel>);
    expect(container.firstChild).toHaveTextContent("Saved for later");
    expect(container.firstChild).not.toHaveClass("border-y");
  });
});

describe("GroupHeader", () => {
  it("toggles from its left part, with controls of its own on the right", async () => {
    const onToggle = vi.fn();
    const onReviews = vi.fn();
    render(
      <TooltipProvider>
        <GroupHeader
          open
          onToggle={onToggle}
          toggleLabel="Hide Grace Kowalczyk's sections"
          title="Grace Kowalczyk"
          meta="★ 4.2 (61)"
          right={
            <button type="button" onClick={onReviews}>
              Reviews
            </button>
          }
          sticky
        />
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { expanded: true });
    expect(toggle).toHaveTextContent("Grace Kowalczyk★ 4.2 (61)");
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Reviews" }));
    expect(onReviews).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(toggle.parentElement).toHaveClass("sticky", "top-9");
  });
});

describe("ListRow", () => {
  it("lays out lead, main, trail and action, and passes the rest to the row", async () => {
    const onPointerEnter = vi.fn();
    render(
      <ul>
        <ListRow
          as="li"
          lead="0101"
          trail="12 open"
          action={<button type="button">Switch</button>}
          state="current"
          data-section="0101"
          onPointerEnter={onPointerEnter}
        >
          F 9–9:50am CSI 1122
        </ListRow>
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveAttribute("data-section", "0101");
    expect(row).toHaveAttribute("data-state", "current");
    expect(row).toHaveClass("bg-accent-soft");
    expect(row).toHaveTextContent("0101F 9–9:50am CSI 112212 openSwitch");
    await userEvent.setup().hover(row);
    expect(onPointerEnter).toHaveBeenCalled();
  });

  it("is one tight line when compact", () => {
    render(<ListRow density="compact">0002</ListRow>);
    expect(screen.getByText("0002").parentElement).toHaveClass("py-1");
  });
});

describe("EmptyState and PanelFooter", () => {
  it("render their content", () => {
    render(
      <>
        <EmptyState action={<button type="button">Add a block</button>}>
          No blocks yet.
        </EmptyState>
        <PanelFooter>
          <button type="button">Generate plans</button>
        </PanelFooter>
      </>,
    );
    expect(screen.getByText("No blocks yet.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Generate plans" }).parentElement,
    ).toHaveClass("border-t");
  });
});
