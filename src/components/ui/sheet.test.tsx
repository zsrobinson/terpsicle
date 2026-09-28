import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { Sheet, SheetTitle } from "./sheet";

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <Sheet open={open} onOpenChange={setOpen} data-testid="sheet">
      <PageHeader
        size="panel"
        title={
          <SheetTitle asChild>
            <span>Notifications</span>
          </SheetTitle>
        }
      />
      <p>Nothing new.</p>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("is a dialog named by its heading", () => {
    render(<Harness />);
    const sheet = screen.getByRole("dialog", { name: "Notifications" });
    expect(sheet).toHaveAttribute("data-slot", "sheet");
    expect(sheet).toHaveTextContent("Nothing new.");
    // The panel header's h2 is the name, not a second heading.
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("closes with Esc", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sheet = await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    // vaul keeps it mounted while it slides away.
    await waitFor(() => expect(sheet).toHaveAttribute("data-state", "closed"));
  });
});
