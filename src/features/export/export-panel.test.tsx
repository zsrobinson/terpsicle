import { act, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { switchSection } from "~/app/actions";
import { track } from "~/app/analytics";
import type { ShellRoutes } from "~/app/test-utils";
import { decodeShare, SHARE_PARAM } from "~/core/share";
import {
  fakeSeatWatchesClient,
  resetSeatWatches,
  watching,
} from "~/features/alerts/testing";
import { renderPlanTab } from "~/features/courses/testing";
import { aMeUser, aSeatWatch, fixtureTermId } from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import { ExportPanel } from "./export-panel";

const panels: ShellRoutes = { tabs: { export: ExportPanel } };

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

const writeText = vi.fn<(text: string) => Promise<void>>();

/** Call after rendering: user-event installs its own clipboard on setup. */
function stubClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("Export tab", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(track).mockClear();
    writeText.mockReset().mockResolvedValue(undefined);
    toast.dismiss();
    resetSeatWatches();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orders the checklist by who fills first, each with a backup or none", async () => {
    await renderPlanTab([panels], "export");
    const list = await screen.findByRole("list", {
      name: "Registration checklist",
    });
    const rows = within(list).getAllByRole("listitem");
    // Fewest open seats first: ENGL393 (2 left), CMSC351 (3), STAT400 (6).
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      "checklist-ENGL393-0101",
      "checklist-CMSC351-0301",
      "checklist-STAT400-0101",
      "checklist-CMSC330-0103",
      "checklist-ECON200-0101",
    ]);
    await waitFor(() =>
      expect(rows[1]).toHaveTextContent(/Backup: \w{4}|No backup fits/),
    );
    expect(within(list).getAllByText("No backup fits").length).toBeGreaterThan(
      0,
    );
    expect(within(list).getAllByText(/^Backup:/).length).toBeGreaterThan(0);
    // The backup leads with its code, then who teaches it; "also fits" is
    // said once, above the list.
    expect(
      within(screen.getByTestId("checklist-ECON200-0101")).getByText(
        /^Backup:/,
      ),
    ).toHaveTextContent("Backup: 0201 · Daniel Novak");
    expect(
      screen.getByText(/If one fills, try its backup, which also fits/),
    ).toBeInTheDocument();
  });

  it("says a one-section course has no other section, not that no backup fits", async () => {
    await renderPlanTab([panels], "export");
    act(() => {
      switchSection("CMSC425", "0101", "list");
    });
    const row = await screen.findByTestId("checklist-CMSC425-0101");
    await waitFor(() => expect(row).toHaveTextContent("The only section"));
    expect(row).not.toHaveTextContent("No backup fits");
  });

  it("remembers checked rows per plan", async () => {
    const { user } = await renderPlanTab([panels], "export");
    const box = await screen.findByRole("checkbox", { name: "CMSC351 0301" });
    await user.click(box);
    expect(box).toBeChecked();
    expect(track).toHaveBeenCalledWith("registration_item_checked", {});
    expect(localStorage.getItem("terpsicle:registration-checklist")).toContain(
      "CMSC351-0301",
    );
  });

  it("copies section codes the way Testudo takes them", async () => {
    const { user } = await renderPlanTab([panels], "export");
    stubClipboard();
    await user.click(
      await screen.findByRole("button", {
        name: /Copy course and section codes/,
      }),
    );
    expect(writeText).toHaveBeenCalledWith(
      [
        "CMSC351 0301",
        "CMSC330 0103",
        "STAT400 0101",
        "ENGL393 0101",
        "ECON200 0101",
      ].join("\n"),
    );
    expect(await screen.findByText("Copied 5 section codes")).toBeVisible();
    expect(track).toHaveBeenCalledWith("export_codes_copied", { count: 5 });
  });

  it("says so when the clipboard is blocked", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const { user } = await renderPlanTab([panels], "export");
    stubClipboard();
    await user.click(
      await screen.findByRole("button", {
        name: /Copy course and section codes/,
      }),
    );
    expect(
      await screen.findByText(/this browser blocked the clipboard/),
    ).toBeVisible();
    expect(track).not.toHaveBeenCalledWith(
      "export_codes_copied",
      expect.anything(),
    );
  });

  it("copies a share link that decodes back to the plan", async () => {
    const { user } = await renderPlanTab([panels], "export");
    stubClipboard();
    await user.click(
      await screen.findByRole("button", { name: /Copy share link/ }),
    );
    const url = new URL(writeText.mock.calls[0]?.[0] ?? "");
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
    expect(track).toHaveBeenCalledWith("share_link_copied", {});
  });

  it("downloads an .ics of the plan", async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob);
      return "blob:ics";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const { user } = await renderPlanTab([panels], "export");
    const button = await screen.findByRole("button", {
      name: /Add to your calendar/,
    });
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    await user.click(button);
    expect(click).toHaveBeenCalled();
    const text = await created[0]?.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("CMSC351");
    expect(
      await screen.findByText(/^Downloaded terpsicle-spring-2027\.ics$/),
    ).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith("ics_downloaded", {
      events: expect.any(Number),
    });
  });

  it("says when the term's dates didn't load, and Try again loads them", async () => {
    const { user } = await renderPlanTab([panels], "export");
    const button = await screen.findByRole("button", {
      name: /Add to your calendar/,
    });
    await waitFor(() =>
      expect(button).not.toHaveAttribute("aria-disabled", "true"),
    );
    const ensure = vi
      .spyOn(useCatalog.getState(), "ensureCalendar")
      .mockResolvedValue();
    act(() =>
      useCatalog.setState((s) => ({
        calendars: {},
        calendarsState: { ...s.calendarsState, [fixtureTermId]: "error" },
      })),
    );
    expect(
      screen.getByText(/Couldn't load the term's dates/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(ensure).toHaveBeenCalledWith(fixtureTermId);
  });

  describe("watching for a seat", () => {
    const here = aSeatWatch({ sectionKey: "CMSC351-0301" });
    const otherTerm = aSeatWatch({
      termId: "202608",
      sectionKey: "ENGL393-0101",
      lastNotifiedAt: "2026-09-25T14:00:00.000Z",
    });

    it("lists watches; Stop is immediate, with Undo", async () => {
      const client = fakeSeatWatchesClient([here, otherTerm]);
      const { user } = await renderPlanTab([panels], "export");
      act(() => watching(aMeUser(), here, otherTerm));
      const list = await screen.findByRole("region", {
        name: "Watching for a seat",
      });
      const row = within(list).getByTestId("seat-watch-CMSC351-0301");
      expect(row).toHaveTextContent("Watching · Since Sep 24");
      // Another term's watch says which term.
      expect(
        within(list).getByTestId("seat-watch-ENGL393-0101"),
      ).toHaveTextContent(/Fall 2026.*Last notified Sep 25/);

      await user.click(within(row).getByRole("button", { name: "Stop" }));
      await waitFor(() =>
        expect(screen.queryByTestId("seat-watch-CMSC351-0301")).toBeNull(),
      );
      expect(client.unwatch).toHaveBeenCalledWith({
        termId: fixtureTermId,
        sectionKey: "CMSC351-0301",
      });
      expect(track).toHaveBeenCalledWith("seat_watch_stopped", {});
      // No dialog: Undo in the toast brings it back.
      await user.click(await screen.findByRole("button", { name: "Undo" }));
      expect(
        await screen.findByTestId("seat-watch-CMSC351-0301"),
      ).toBeInTheDocument();
      expect(client.watch).toHaveBeenCalledWith({
        termId: fixtureTermId,
        sectionKey: "CMSC351-0301",
      });
    });

    it("hides the list with no watches, signed out, or while seat alerts are off", async () => {
      await renderPlanTab([panels], "export");
      act(() => watching(aMeUser()));
      expect(
        screen.queryByRole("region", { name: "Watching for a seat" }),
      ).toBeNull();
      act(() => resetSeatWatches());
      expect(
        screen.queryByRole("region", { name: "Watching for a seat" }),
      ).toBeNull();
    });
  });
});
