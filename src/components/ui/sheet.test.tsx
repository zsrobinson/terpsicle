import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { Sheet, SheetTitle } from "./sheet";
import { SheetIndent } from "./sheet-indent";
import { TooltipProvider } from "./tooltip";

function Harness({
  detents,
  startOpen = true,
}: {
  detents?: readonly ("medium" | "large")[];
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <TooltipProvider delayDuration={0}>
      <SheetIndent>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          detents={detents}
          data-testid="sheet"
        >
          <PageHeader
            size="panel"
            title={
              <SheetTitle asChild>
                <span>Notifications</span>
              </SheetTitle>
            }
          />
          <p>Nothing new.</p>
          <label>
            Reply
            <input />
          </label>
        </Sheet>
      </SheetIndent>
    </TooltipProvider>
  );
}

describe("Sheet", () => {
  it("is a dialog named by its heading", async () => {
    render(<Harness />);
    const sheet = await screen.findByRole("dialog", { name: "Notifications" });
    expect(sheet).toHaveAttribute("data-slot", "sheet");
    expect(sheet).toHaveTextContent("Nothing new.");
    // The panel header's h2 is the name, not a second heading.
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("is named by a heading that has an id of its own", async () => {
    render(
      <Sheet open onOpenChange={() => undefined}>
        <SheetTitle asChild>
          <span id="plans-title">Plans</span>
        </SheetTitle>
      </Sheet>,
    );
    expect(
      await screen.findByRole("dialog", { name: "Plans" }),
    ).toHaveAttribute("aria-labelledby", "plans-title");
  });

  it("closes with Esc", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("fits what's in it, with a grabber that's only a sign", async () => {
    render(<Harness />);
    const sheet = await screen.findByRole("dialog");
    expect(sheet).not.toHaveAttribute("data-detent");
    expect(
      screen.queryByRole("button", { name: /the sheet$/ }),
    ).not.toBeInTheDocument();
  });

  it("with detents, opens at medium, and the grabber steps to large and back", async () => {
    const user = userEvent.setup();
    render(<Harness detents={["medium", "large"]} />);
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveAttribute("data-detent", "medium");
    await user.click(screen.getByRole("button", { name: "Raise the sheet" }));
    expect(sheet).toHaveAttribute("data-detent", "large");
    await user.click(screen.getByRole("button", { name: "Lower the sheet" }));
    expect(sheet).toHaveAttribute("data-detent", "medium");
  });

  it("opens at medium again, wherever it was left", async () => {
    const user = userEvent.setup();
    render(<Harness detents={["medium", "large"]} />);
    await user.click(
      await screen.findByRole("button", { name: "Raise the sheet" }),
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("dialog")).toHaveAttribute(
      "data-detent",
      "medium",
    );
  });

  it("ticks on an iPhone when the grabber's tap steps a detent, once", async () => {
    // Pretend to be an iPhone, as haptic.test.tsx does.
    const iPhone: Record<string, unknown> = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
      vibrate: undefined,
    };
    const shadowed = Object.keys(iPhone);
    for (const [key, value] of Object.entries(iPhone))
      Object.defineProperty(navigator, key, { value, configurable: true });
    try {
      const user = userEvent.setup();
      render(<Harness detents={["medium", "large"]} />);
      const sheet = await screen.findByRole("dialog");
      const grabber = screen.getByRole("button", { name: "Raise the sheet" });
      const ticks = grabber.querySelectorAll("input[data-haptic-tap]");
      expect(ticks).toHaveLength(1);
      const tick = ticks[0];
      if (!(tick instanceof HTMLElement)) throw new Error("no switch");
      await user.click(tick);
      expect(sheet).toHaveAttribute("data-detent", "large");
    } finally {
      for (const key of shadowed) Reflect.deleteProperty(navigator, key);
    }
  });

  it("goes to large when a field takes focus, before the keyboard covers it", async () => {
    const user = userEvent.setup();
    render(<Harness detents={["medium", "large"]} />);
    const sheet = await screen.findByRole("dialog");
    await user.click(screen.getByLabelText("Reply"));
    expect(sheet).toHaveAttribute("data-detent", "large");
  });

  it("marks the page behind it while it's open", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness startOpen={false} />);
    const page = container.querySelector("[data-sheet-indent]");
    expect(page).not.toHaveAttribute("data-active");
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("dialog");
    expect(page).toHaveAttribute("data-active");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(page).not.toHaveAttribute("data-active"));
  });
});
