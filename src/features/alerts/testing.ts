// Test helpers for seat watches. Not used by the app.
import { vi } from "vitest";
import type { MeUser, SeatWatch } from "~/core/schema";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { useSeatWatches } from "~/state/seat-watches";
import { type SeatWatchesClient, setSeatWatchesClient } from "./seat-watches";

/**
 * The account as /api/me leaves it with seat alerts on: signed in as `user`
 * (fixtures' `aMeUser()`), or signed out with null.
 */
export function seatAlertsAccount(user: MeUser | null): void {
  useAccount.setState({
    status: user ? "signed-in" : "signed-out",
    flags: { ...FLAGS_OFF, signIn: true, seatAlerts: true },
    user,
    deleteAfter: null,
  });
}

/** Back to how a page starts: /api/me hasn't answered, no watches. */
export function resetSeatWatches(): void {
  useAccount.setState({
    status: "loading",
    flags: FLAGS_OFF,
    user: null,
    deleteAfter: null,
  });
  useSeatWatches.getState().setAll(null);
}

/** A fake API that keeps its watches in memory, starting from `initial`. */
export function fakeSeatWatchesClient(initial: readonly SeatWatch[] = []) {
  let watches = [...initial];
  const client = {
    watch: vi.fn<SeatWatchesClient["watch"]>(async (input) => {
      const watch = watches.find(
        (w) => w.termId === input.termId && w.sectionKey === input.sectionKey,
      ) ?? {
        ...input,
        createdAt: "2026-09-26T12:00:00.000Z",
        lastNotifiedAt: null,
      };
      watches = [watch, ...watches.filter((w) => w !== watch)];
      return { status: "watching", watch };
    }),
    unwatch: vi.fn<SeatWatchesClient["unwatch"]>(async (input) => {
      watches = watches.filter(
        (w) =>
          !(w.termId === input.termId && w.sectionKey === input.sectionKey),
      );
      return { status: "stopped" };
    }),
    list: vi.fn<SeatWatchesClient["list"]>(async () => ({
      status: "ok",
      watches,
    })),
  };
  setSeatWatchesClient(client);
  return client;
}

/** Signed in as `user`, with these watches loaded. */
export function watching(user: MeUser, ...watches: SeatWatch[]): void {
  seatAlertsAccount(user);
  useSeatWatches.getState().setAll(watches);
}
