import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Search } from "lucide-react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { DrawerSnap } from "~/core/schema";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { SheetIndent } from "~/ui/sheet-indent";
import { TooltipProvider } from "~/ui/tooltip";
import { DrawerTab, DrawerTabs, WorkbenchDrawer } from "./drawer";

function Harness({
  start = "half",
  drawer = true,
}: {
  start?: DrawerSnap;
  drawer?: boolean;
}) {
  const [snap, setSnap] = useState<DrawerSnap>(start);
  const [sheet, setSheet] = useState(false);
  return (
    <TooltipProvider delayDuration={0}>
      <SheetIndent>
        <main>
          <p>Week calendar</p>
          <button type="button" onClick={() => setSheet(true)}>
            Account
          </button>
        </main>
        {drawer ? (
          <WorkbenchDrawer
            snap={snap}
            getSnap={() => snap}
            onSnap={setSnap}
            title="Sidebar"
            tabs={
              <DrawerTabs label="Tabs">
                <DrawerTab
                  icon={Search}
                  label="Search"
                  selected
                  onClick={() => undefined}
                />
              </DrawerTabs>
            }
          >
            <label>
              Search courses
              <input />
            </label>
          </WorkbenchDrawer>
        ) : null}
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetTitle>Account</SheetTitle>
        </Sheet>
      </SheetIndent>
    </TooltipProvider>
  );
}

const drawer = () => screen.findByRole("dialog", { name: "Sidebar" });
const indent = () => document.querySelector("[data-sheet-indent]");

describe("WorkbenchDrawer", () => {
  it("is the sidebar, open beside the page and never modal", async () => {
    render(<Harness />);
    const el = await drawer();
    expect(el).toHaveAttribute("data-workbench-drawer");
    expect(el).toHaveAttribute("data-snap", "half");
    // The page stays reachable: nothing outside is hidden or inert.
    const page = screen.getByText("Week calendar");
    expect(page.closest("[aria-hidden='true'], [inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Account" })).toBeVisible();
    // Being open doesn't scale the page back: only a sheet over it does.
    expect(indent()).not.toHaveAttribute("data-active");
    // It's part of the page, so it scales back with it under a sheet.
    expect(indent()?.contains(el)).toBe(true);
  });

  it("scales back with the page when a sheet opens over it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await drawer();
    await user.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByRole("dialog", { name: "Account" });
    await waitFor(() => expect(indent()).toHaveAttribute("data-active"));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Account" })).toBeNull(),
    );
    // The drawer stays, where it was.
    expect(await drawer()).toHaveAttribute("data-snap", "half");
    await waitFor(() => expect(indent()).not.toHaveAttribute("data-active"));
  });

  it("doesn't close on Esc", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const el = await drawer();
    screen.getByRole("button", { name: "Raise the panel" }).focus();
    await user.keyboard("{Escape}");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-snap", "half");
  });

  it("stays in the Tab order after focus moves to the page", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await drawer();
    const field = screen.getByRole("textbox", { name: "Search courses" });
    await user.click(field);
    screen.getByRole("button", { name: "Account" }).focus();
    expect(field).not.toHaveAttribute("tabindex");
    expect(field).not.toHaveAttribute("data-tabindex");
    expect(screen.getByRole("button", { name: "Search" })).not.toHaveAttribute(
      "tabindex",
    );
  });

  it("takes no focus when it appears", async () => {
    render(<Harness />);
    await drawer();
    expect(document.activeElement).toBe(document.body);
  });

  it("puts its snap on <html> for the shell, and takes it away", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness start="peek" />);
    await drawer();
    expect(document.documentElement).toHaveAttribute(
      "data-drawer-snap",
      "peek",
    );
    await user.click(screen.getByRole("button", { name: "Raise the panel" }));
    expect(document.documentElement).toHaveAttribute(
      "data-drawer-snap",
      "half",
    );
    rerender(<Harness start="peek" drawer={false} />);
    expect(document.documentElement).not.toHaveAttribute("data-drawer-snap");
  });

  it("steps peek → half → full → peek with the grabber", async () => {
    const user = userEvent.setup();
    render(<Harness start="peek" />);
    const el = await drawer();
    await user.click(screen.getByRole("button", { name: "Raise the panel" }));
    expect(el).toHaveAttribute("data-snap", "half");
    await user.click(screen.getByRole("button", { name: "Raise the panel" }));
    expect(el).toHaveAttribute("data-snap", "full");
    await user.click(screen.getByRole("button", { name: "Lower the panel" }));
    expect(el).toHaveAttribute("data-snap", "peek");
  });

  it("rises from peek when something inside takes focus", async () => {
    const user = userEvent.setup();
    render(<Harness start="peek" />);
    const el = await drawer();
    await user.click(screen.getByRole("textbox", { name: "Search courses" }));
    expect(el).toHaveAttribute("data-snap", "half");
  });
});
