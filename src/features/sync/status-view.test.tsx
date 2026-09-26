import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { useSyncStatus } from "./status";
import { SyncStatusIcon, SyncStatusLine } from "./status-view";
import { SYNC_STATUS_LOOK } from "./view";

// The sync status says little, quietly, and only while signed in.

const wrap = () =>
  render(
    <TooltipProvider delayDuration={0}>
      <SyncStatusIcon />
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
    expect(
      screen.getByText("Offline, will save when you're back"),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", {
      name: "Offline, will save when you're back",
    });
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
});
