import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatBell } from "~/features/course-details/seat-bell";
import { aMeUser, aSeatWatch, fixtureTermId } from "~/fixtures";
import { track } from "~/lib/analytics";
import { ApiCallError } from "~/server/fns/api";
import {
  cachedSeatWatches,
  useWatchedSections,
} from "~/state/query/seat-watches";
import { createTestQueryClient } from "~/state/query/testing";
import { Toaster } from "~/ui/sonner";
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
const KEY = "CMSC351-0101";

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(track).mockClear();
  resetSeatWatches();
});

// Sonner removes a dismissed toast on a timer; waiting keeps that timer
// from firing after the DOM is torn down.
afterEach(async () => {
  toast.dismiss();
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
  );
});

/** A promise that waits until `open()`. */
function gate() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** `client` around a tree, as the router gives every page one. */
function withClient(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/**
 * Three places that show the list, over the page's one query: a section's
 * bell (Schedule), the sections watched in the term (the calendar and
 * Problems) and Settings' Watching list (the account menu's).
 */
function renderSurfaces() {
  const client = createTestQueryClient();
  let watched: ReadonlySet<string> = new Set();
  function Watched() {
    watched = useWatchedSections(fixtureTermId);
    return null;
  }
  render(
    <TooltipProvider delayDuration={0}>
      <SeatBell termId={fixtureTermId} sectionKey={KEY} />
      <Watched />
      <SeatWatchesSection />
      <Toaster />
    </TooltipProvider>,
    { wrapper: withClient(client) },
  );
  return { client, user: userEvent.setup(), watched: () => watched };
}

const bell = () => document.querySelector("[data-alert]");
const listed = () => screen.queryByTestId(`seat-watch-${KEY}`);
const NOT_WATCHING = /^You're not watching any sections\./;

/** The toast that says `text`. */
const toastSaying = async (text: string) => {
  const found = (await screen.findByText(text)).closest<HTMLElement>(
    "[data-sonner-toast]",
  );
  if (!found) throw new Error(`No toast says ${text}`);
  return found;
};

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
    const api = fakeSeatWatchesClient([
      aSeatWatch({ sectionKey: "AAAS100-0101" }),
    ]);
    const client = createTestQueryClient();
    rememberPendingWatch(fixtureTermId, "CMSC351-0101");
    renderHook(() => useSeatWatchesSync(), { wrapper: withClient(client) });
    expect(api.list).not.toHaveBeenCalled();

    act(() => seatAlertsAccount(aMeUser()));
    await waitFor(() =>
      expect(api.watch).toHaveBeenCalledWith({
        termId: fixtureTermId,
        sectionKey: "CMSC351-0101",
      }),
    );
    await waitFor(() =>
      expect(cachedSeatWatches(client)?.map((w) => w.sectionKey)).toEqual([
        "CMSC351-0101",
        "AAAS100-0101",
      ]),
    );
    expect(track).toHaveBeenCalledWith("seat_watch_started", {
      signedInFirst: true,
    });
    expect(sessionStorage.getItem(PENDING_WATCH_KEY)).toBeNull();
  });

  it("asks for the list once, however many places show it", async () => {
    const api = fakeSeatWatchesClient([aSeatWatch()]);
    seatAlertsAccount(aMeUser());
    const { client } = renderSurfaces();
    renderHook(() => useSeatWatchesSync(), { wrapper: withClient(client) });
    expect(await screen.findByTestId(`seat-watch-${KEY}`)).toBeVisible();
    expect(api.list).toHaveBeenCalledOnce();
  });

  it("forgets the list on sign-out", async () => {
    fakeSeatWatchesClient([aSeatWatch()]);
    const client = createTestQueryClient();
    act(() => seatAlertsAccount(aMeUser()));
    renderHook(() => useSeatWatchesSync(), { wrapper: withClient(client) });
    await waitFor(() => expect(cachedSeatWatches(client)).toHaveLength(1));
    act(() => seatAlertsAccount(null));
    await waitFor(() => expect(cachedSeatWatches(client)).toBeUndefined());
  });
});

describe("one list, every place", () => {
  it("a watch started on a bell shows everywhere at once, before the server answers", async () => {
    const api = fakeSeatWatchesClient();
    const server = api.watch.getMockImplementation();
    const answer = gate();
    api.watch.mockImplementationOnce(async (input) => {
      await answer.promise;
      if (!server) throw new Error("no fake");
      return server(input);
    });
    seatAlertsAccount(aMeUser());
    const { user, watched } = renderSurfaces();
    expect(await screen.findByText(NOT_WATCHING)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /^Watch for a seat.*0101$/ }),
    );
    // The server hasn't answered: the bell, the term's watched sections
    // and Settings' list all say so already.
    expect(api.watch).toHaveBeenCalledOnce();
    expect(bell()).toHaveAttribute("data-alert", "watching");
    expect(listed()).toBeVisible();
    expect(watched().has(KEY)).toBe(true);

    act(() => answer.open());
    const shown = await toastSaying("Watching CMSC351 0101");
    expect(shown).toHaveTextContent("We'll let you know when a seat opens.");
    expect(track).toHaveBeenCalledWith("seat_watch_started", {
      signedInFirst: false,
    });
    // Settled: the server's list again, which has it.
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(listed()).toBeVisible();
    expect(bell()).toHaveAttribute("data-alert", "watching");
  });

  it("a watch the server turns down comes back down, and says why", async () => {
    const api = fakeSeatWatchesClient();
    api.watch.mockResolvedValueOnce({ status: "too-many", max: 30 });
    seatAlertsAccount(aMeUser());
    const { user, watched } = renderSurfaces();
    expect(await screen.findByText(NOT_WATCHING)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /^Watch for a seat.*0101$/ }),
    );
    expect(
      await screen.findByText(
        "You're watching 30 sections, the most at once. Stop one to watch CMSC351 0101.",
      ),
    ).toBeVisible();
    expect(bell()).toHaveAttribute("data-alert", "none");
    expect(listed()).toBeNull();
    expect(watched().has(KEY)).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it("a watch that can't reach the server comes back down", async () => {
    const api = fakeSeatWatchesClient();
    api.watch.mockRejectedValueOnce(new ApiCallError("network"));
    seatAlertsAccount(aMeUser());
    const { user } = renderSurfaces();
    expect(await screen.findByText(NOT_WATCHING)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: /^Watch for a seat.*0101$/ }),
    );
    expect(
      await screen.findByText(
        "Couldn't reach Terpsicle. Check your connection and try again.",
      ),
    ).toBeVisible();
    expect(bell()).toHaveAttribute("data-alert", "none");
    expect(screen.getByText(NOT_WATCHING)).toBeVisible();
  });

  it("Stop in Settings takes it off every place at once, and Undo puts it back", async () => {
    const api = fakeSeatWatchesClient([aSeatWatch()]);
    const server = api.unwatch.getMockImplementation();
    const answer = gate();
    api.unwatch.mockImplementationOnce(async (input) => {
      await answer.promise;
      if (!server) throw new Error("no fake");
      return server(input);
    });
    seatAlertsAccount(aMeUser());
    const { user, watched } = renderSurfaces();
    const row = await screen.findByTestId(`seat-watch-${KEY}`);
    expect(bell()).toHaveAttribute("data-alert", "watching");

    await user.click(within(row).getByRole("button", { name: "Stop" }));
    expect(listed()).toBeNull();
    expect(bell()).toHaveAttribute("data-alert", "none");
    expect(watched().has(KEY)).toBe(false);

    act(() => answer.open());
    const stopped = await toastSaying("Stopped watching CMSC351 0101");
    expect(stopped).toHaveTextContent("No more notifications about it.");
    expect(track).toHaveBeenCalledWith("seat_watch_stopped", {});

    // No dialog: Undo in the toast starts it again, everywhere.
    await user.click(within(stopped).getByRole("button", { name: "Undo" }));
    expect(await screen.findByTestId(`seat-watch-${KEY}`)).toBeVisible();
    expect(bell()).toHaveAttribute("data-alert", "watching");
    expect(api.watch).toHaveBeenCalledWith({
      termId: fixtureTermId,
      sectionKey: KEY,
    });
  });

  it("a stop that can't reach the server puts the watch back", async () => {
    const api = fakeSeatWatchesClient([aSeatWatch()]);
    api.unwatch.mockRejectedValueOnce(new ApiCallError("rate-limited"));
    seatAlertsAccount(aMeUser());
    const { user } = renderSurfaces();
    const row = await screen.findByTestId(`seat-watch-${KEY}`);

    await user.click(within(row).getByRole("button", { name: "Stop" }));
    expect(
      await screen.findByText(
        "That's a lot of changes at once. Wait a few minutes, then try again.",
      ),
    ).toBeVisible();
    expect(listed()).toBeVisible();
    expect(bell()).toHaveAttribute("data-alert", "watching");
  });
});

describe("the Watching list on Settings", () => {
  it("says it didn't load, and Try again loads it", async () => {
    const api = fakeSeatWatchesClient([aSeatWatch()]);
    api.list.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    act(() => seatAlertsAccount(aMeUser()));
    renderSurfaces();
    expect(
      await screen.findByText(
        "We couldn't load the sections you're watching. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    // Not loaded: the bell still offers the watch.
    expect(bell()).toHaveAttribute("data-alert", "none");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId(`seat-watch-${KEY}`)).toBeVisible();
    expect(screen.queryByText(/We couldn't load/)).toBeNull();
    expect(bell()).toHaveAttribute("data-alert", "watching");
  });
});
