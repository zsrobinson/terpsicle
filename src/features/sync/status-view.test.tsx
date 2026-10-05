import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { useSyncStatus } from "./status";
import { SyncStatusLine, SyncStatusSlot } from "./status-view";
import { SYNC_STATUS_LOOK } from "./view";

// The sync status says little, quietly, and only while signed in: the bar's
// sync slot (a word) and the account menu's line (the whole sentence).

const wrap = (compact = false) =>
  render(
    <TooltipProvider delayDuration={0}>
      <SyncStatusSlot compact={compact} />
      <SyncStatusLine />
    </TooltipProvider>,
  );

describe("sync status", () => {
  beforeEach(() => {
    useSyncStatus.setState({ status: "off", look: null, syncNow: null });
  });

  it("shows nothing while signed out, or before the engine loads", () => {
    const { container } = wrap();
    expect(container).toBeEmptyDOMElement();
    act(() => useSyncStatus.setState({ status: "saved" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("says what's happening, with a tooltip, and checks now when pressed", async () => {
    const syncNow = vi.fn();
    useSyncStatus.setState({
      status: "offline",
      look: SYNC_STATUS_LOOK,
      syncNow,
    });
    const user = userEvent.setup();
    wrap();
    // The account menu's line has the sentence; the bar's slot, a word.
    expect(
      screen.getByText("Offline, will save when you're back"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Saves when online" });
    expect(button).toHaveAttribute("data-sync-status", "offline");
    await user.hover(button);
    expect(
      await screen.findByRole("tooltip", {
        name: "Your changes are kept on this device and saved to your account once you're online",
      }),
    ).toBeInTheDocument();
    await user.click(button);
    expect(syncNow).toHaveBeenCalledOnce();

    act(() => useSyncStatus.setState({ status: "saved" }));
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
  });

  it("is words for screen readers on a phone's bar, with nothing to press", () => {
    useSyncStatus.setState({
      status: "saved",
      look: SYNC_STATUS_LOOK,
      syncNow: vi.fn(),
    });
    wrap(true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
