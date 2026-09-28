import { screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { decodeShare, SHARE_PARAM } from "~/core/share";
import { renderPlanTab } from "~/features/courses/testing";
import { fixtureTermId } from "~/fixtures";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const writeText = vi.fn<(text: string) => Promise<void>>();

/** Call after rendering: user-event installs its own clipboard on setup. */
function stubClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("Share, over the calendar", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    writeText.mockReset().mockResolvedValue(undefined);
    toast.dismiss();
  });

  it("opens a popover with the plan's link, which Copy link copies", async () => {
    const { user } = await renderPlanTab([], "courses");
    stubClipboard();
    await user.click(screen.getByRole("button", { name: "Share" }));
    const popover = await screen.findByRole("dialog", { name: "Share Plan A" });
    const field = within(popover).getByRole("textbox", { name: "Share link" });
    expect(field).toHaveAttribute("readonly");
    const url = new URL((field as HTMLInputElement).value);
    expect(url.pathname).toBe("/schedule");
    const decoded = decodeShare(url.searchParams.get(SHARE_PARAM) ?? "");
    expect(decoded.ok && decoded.payload).toMatchObject({
      termId: fixtureTermId,
      name: "Plan A",
      sections: [
        "CMSC351-0301",
        "CMSC330-0103",
        "STAT400-0101",
        "ENGL393-0101",
        "ECON200-0101",
      ],
      saved: ["MUSC130", "PHIL140"],
    });
    // It says what the link is: a copy in the URL, not a live view.
    expect(popover).toHaveTextContent(
      "The link holds a copy of this plan in the URL itself, so it won't change when you edit the plan later.",
    );

    await user.click(
      within(popover).getByRole("button", { name: "Copy link" }),
    );
    expect(writeText).toHaveBeenCalledWith(url.toString());
    expect(await screen.findByText("Copied link")).toBeVisible();
    expect(track).toHaveBeenCalledWith("share_link_copied", {
      product: "schedule",
    });
  });

  it("says so when the clipboard is blocked, leaving the link to copy by hand", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const { user } = await renderPlanTab([], "courses");
    stubClipboard();
    await user.click(screen.getByRole("button", { name: "Share" }));
    const popover = await screen.findByRole("dialog", { name: "Share Plan A" });
    await user.click(
      within(popover).getByRole("button", { name: "Copy link" }),
    );
    expect(
      await screen.findByText(/this browser blocked the clipboard/),
    ).toBeVisible();
    expect(track).not.toHaveBeenCalledWith(
      "share_link_copied",
      expect.anything(),
    );
    expect(
      within(popover).getByRole("textbox", { name: "Share link" }),
    ).toBeVisible();
  });
});
