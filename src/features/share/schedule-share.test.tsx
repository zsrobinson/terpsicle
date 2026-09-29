import { screen, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeShare, SHARE_PARAM } from "~/core/share";
import { renderPlanTab } from "~/features/courses/testing";
import { fixtureTermId } from "~/fixtures";
import { track } from "~/lib/analytics";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

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

  describe("on a touch screen with a share sheet", () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>();

    beforeEach(() => {
      share.mockReset().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", {
        value: share,
        configurable: true,
      });
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) =>
          ({
            matches: query === "(hover: none) and (pointer: coarse)",
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
          }) as unknown as MediaQueryList,
      );
    });

    afterEach(() => {
      Reflect.deleteProperty(navigator, "share");
      vi.restoreAllMocks();
    });

    it("hands the plan's link to the sheet, with no popover", async () => {
      const { user } = await renderPlanTab([], "courses");
      await user.click(screen.getByRole("button", { name: "Share" }));
      await vi.waitFor(() =>
        expect(track).toHaveBeenCalledWith("share_link_shared", {
          product: "schedule",
        }),
      );
      const url = new URL(share.mock.calls[0]?.[0].url ?? "");
      expect(url.pathname).toBe("/schedule");
      expect(url.searchParams.get(SHARE_PARAM)).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("does nothing more when the sheet is closed", async () => {
      share.mockRejectedValue(new DOMException("Canceled", "AbortError"));
      const { user } = await renderPlanTab([], "courses");
      await user.click(screen.getByRole("button", { name: "Share" }));
      await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(track).not.toHaveBeenCalled();
    });

    it("falls back to the popover when the browser refuses the sheet", async () => {
      share.mockRejectedValue(new DOMException("No", "NotAllowedError"));
      const { user } = await renderPlanTab([], "courses");
      await user.click(screen.getByRole("button", { name: "Share" }));
      const popover = await screen.findByRole("dialog", {
        name: "Share Plan A",
      });
      expect(
        within(popover).getByRole("button", { name: "Copy link" }),
      ).toBeVisible();
    });
  });

  it("keeps the popover where a mouse points, even with a share sheet", async () => {
    const share = vi.fn();
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    try {
      const { user } = await renderPlanTab([], "courses");
      await user.click(screen.getByRole("button", { name: "Share" }));
      expect(
        await screen.findByRole("dialog", { name: "Share Plan A" }),
      ).toBeVisible();
      expect(share).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
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
