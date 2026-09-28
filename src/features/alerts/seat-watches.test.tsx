import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aMeUser, aSeatWatch, fixtureTermId } from "~/fixtures";
import { track } from "~/lib/analytics";
import { useSeatWatches } from "~/state/seat-watches";
import { TooltipProvider } from "~/ui/tooltip";
import {
  PENDING_WATCH_KEY,
  rememberPendingWatch,
  seatWatchState,
  takePendingWatch,
  useSeatWatchesSync,
} from "./seat-watches";
import { SeatWatchesSection } from "./settings-section";
import {
  fakeSeatWatchesClient,
  resetSeatWatches,
  seatAlertsAccount,
} from "./testing";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

const NOW = new Date("2026-09-26T12:00:00.000Z");

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(track).mockClear();
  resetSeatWatches();
});

describe("seatWatchState", () => {
  const watch = aSeatWatch();
  it("hides the bell while /api/me loads or seat alerts are off", () => {
    expect(
      seatWatchState({ status: "loading", seatAlerts: true }, undefined),
    ).toEqual({ kind: "unavailable" });
    expect(
      seatWatchState({ status: "signed-in", seatAlerts: false }, watch),
    ).toEqual({ kind: "unavailable" });
  });

  it("offers sign-in when signed out, else says whether it's watching", () => {
    expect(
      seatWatchState({ status: "signed-out", seatAlerts: true }, undefined),
    ).toEqual({ kind: "signed-out" });
    expect(
      seatWatchState({ status: "signed-in", seatAlerts: true }, undefined),
    ).toEqual({ kind: "none" });
    expect(
      seatWatchState({ status: "signed-in", seatAlerts: true }, watch),
    ).toEqual({ kind: "watching", watch });
  });
});

describe("a watch asked for while signed out", () => {
  it("is read once, and only while the sign-in is recent", () => {
    rememberPendingWatch(fixtureTermId, "CMSC351-0101", NOW);
    expect(takePendingWatch(NOW)).toEqual({
      termId: fixtureTermId,
      sectionKey: "CMSC351-0101",
    });
    expect(takePendingWatch(NOW)).toBeNull();

    rememberPendingWatch(fixtureTermId, "CMSC351-0101", NOW);
    expect(takePendingWatch(new Date(NOW.getTime() + 31 * 60_000))).toBeNull();
  });

  it("ignores anything it didn't write", () => {
    sessionStorage.setItem(PENDING_WATCH_KEY, '{"termId":"x"}');
    expect(takePendingWatch(NOW)).toBeNull();
    sessionStorage.setItem(PENDING_WATCH_KEY, "not json");
    expect(takePendingWatch(NOW)).toBeNull();
  });
});

describe("useSeatWatchesSync", () => {
  it("loads the list once signed in, then starts the pending watch", async () => {
    const client = fakeSeatWatchesClient([
      aSeatWatch({ sectionKey: "AAAS100-0101" }),
    ]);
    rememberPendingWatch(fixtureTermId, "CMSC351-0101");
    renderHook(() => useSeatWatchesSync());
    expect(client.list).not.toHaveBeenCalled();

    act(() => seatAlertsAccount(aMeUser()));
    await waitFor(() =>
      expect(client.watch).toHaveBeenCalledWith({
        termId: fixtureTermId,
        sectionKey: "CMSC351-0101",
      }),
    );
    expect(client.list).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        useSeatWatches.getState().watches?.map((w) => w.sectionKey),
      ).toEqual(["CMSC351-0101", "AAAS100-0101"]),
    );
    expect(track).toHaveBeenCalledWith("seat_watch_started", {
      signedInFirst: true,
    });
    expect(sessionStorage.getItem(PENDING_WATCH_KEY)).toBeNull();
  });

  it("forgets the list on sign-out", async () => {
    fakeSeatWatchesClient([aSeatWatch()]);
    act(() => seatAlertsAccount(aMeUser()));
    renderHook(() => useSeatWatchesSync());
    await waitFor(() =>
      expect(useSeatWatches.getState().watches).toHaveLength(1),
    );
    act(() => seatAlertsAccount(null));
    expect(useSeatWatches.getState().watches).toBeNull();
  });
});

describe("the Watching list on Settings", () => {
  it("says it didn't load, and Try again loads it", async () => {
    const client = fakeSeatWatchesClient([aSeatWatch()]);
    client.list.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => seatAlertsAccount(aMeUser()));
    render(
      <TooltipProvider>
        <SeatWatchesSection />
      </TooltipProvider>,
    );
    expect(
      await screen.findByText(
        "We couldn't load the sections you're watching. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(useSeatWatches.getState().watches).toHaveLength(1),
    );
    expect(screen.queryByText(/We couldn't load/)).toBeNull();
  });
});
