// Test helpers for seat watches. Not used by the app.

import type { QueryClient } from "@tanstack/react-query";
import { vi } from "vitest";
import type { MeUser, SeatWatch } from "~/core/schema";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import {
  type SeatWatchesApi,
  seatWatchesKey,
  setSeatWatchesApi,
} from "~/state/query/seat-watches";

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

/**
 * Back to how a page starts: /api/me hasn't answered. The list lives in
 * each test's own query client, so there's none to forget.
 */
export function resetSeatWatches(): void {
  useAccount.setState({
    status: "loading",
    flags: FLAGS_OFF,
    user: null,
    deleteAfter: null,
  });
}

/** A fake API that keeps its watches in memory, starting from `initial`. */
export function fakeSeatWatchesClient(initial: readonly SeatWatch[] = []) {
  let watches = [...initial];
  const client = {
    watch: vi.fn<SeatWatchesApi["watch"]>(async (input) => {
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
    unwatch: vi.fn<SeatWatchesApi["unwatch"]>(async (input) => {
      watches = watches.filter(
        (w) =>
          !(w.termId === input.termId && w.sectionKey === input.sectionKey),
      );
      return { status: "stopped" };
    }),
    list: vi.fn<SeatWatchesApi["list"]>(async () => ({
      status: "ok",
      watches,
    })),
  };
  setSeatWatchesApi(client);
  return client;
}

/**
 * Signed in as `user`, with these watches loaded into `client` (the page's
 * query client: `renderShell`'s `queryClient`).
 */
export function watching(
  client: QueryClient,
  user: MeUser,
  ...watches: SeatWatch[]
): void {
  // The list first: signing in turns the query on, and a fresh list isn't
  // asked for again.
  client.setQueryData(seatWatchesKey, watches);
  seatAlertsAccount(user);
}
