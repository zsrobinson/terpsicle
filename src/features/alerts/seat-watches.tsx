import {
  MutationObserver,
  mutationOptions,
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { COURSE_PATH } from "~/core/routing";
import {
  IsoDateTimeSchema,
  type SeatWatch,
  type SeatWatchResult,
  type SectionKey,
  SectionKeySchema,
  type TermId,
  TermIdSchema,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { requestInstallPrompt } from "~/features/pwa/install-store";
import { track } from "~/lib/analytics";
import { refetchWhenRunSettles } from "~/lib/settle-run";
import { ApiCallError } from "~/server/fns/api";
import {
  cachedSeatWatches,
  findSeatWatch,
  seatWatchesApi,
  seatWatchesKey,
  seatWatchesQuery,
  useSeatWatchList,
  withoutSeatWatch,
  withSeatWatch,
} from "~/state/query/seat-watches";
import { noteToast, undoToast } from "~/ui/toast";
import { sectionLabel } from "./labels";

// Seat watches from the app's side (SPEC §3.12, V2.md §6.5): "Watch for a
// seat" on a full or low section, "Watching" once it's on. Signed in, one
// click starts or stops a watch, with Undo in the toast (no confirmations,
// DESIGN §5). Signed out, the bell offers sign-in and the watch starts as
// the person comes back.
//
// The list is one query (~/state/query/seat-watches), and starting or
// stopping a watch is a mutation over it: shown at once on every bell, the
// calendar, Problems, the Watching lists and Home, put back if the server
// says no, and asked for again once the last change has settled.

export type SeatWatchState =
  /** Seat alerts are off here, or /api/me hasn't answered: no bell at all. */
  | { kind: "unavailable" }
  /** The bell offers sign-in. */
  | { kind: "signed-out" }
  | { kind: "none" }
  | { kind: "watching"; watch: SeatWatch };

export function seatWatchState(
  account: { status: string; seatAlerts: boolean },
  watch: SeatWatch | undefined,
): SeatWatchState {
  if (!account.seatAlerts || account.status === "loading")
    return { kind: "unavailable" };
  if (account.status !== "signed-in") return { kind: "signed-out" };
  return watch ? { kind: "watching", watch } : { kind: "none" };
}

/** The bell's state for one section. */
export function useSeatWatch(
  termId: TermId,
  sectionKey: SectionKey,
): SeatWatchState {
  const status = useAccount((s) => s.status);
  const seatAlerts = useAccount((s) => s.flags.seatAlerts);
  const watch = findSeatWatch(useSeatWatchList(), termId, sectionKey);
  return useMemo(
    () => seatWatchState({ status, seatAlerts }, watch),
    [status, seatAlerts, watch],
  );
}

/** Whether there's a list to ask for: signed in, with seat alerts on. */
function useSeatWatchesOn(): boolean {
  return useAccount(
    (s) => s.status === "signed-in" && s.flags.seatAlerts && s.user?.id != null,
  );
}

/**
 * The list, asked for while someone is signed in with seat alerts on: for
 * the places that say it's loading or didn't load (Settings) and Home.
 * Everything else reads it with `useSeatWatchList`.
 */
export function useSeatWatches() {
  return useQuery({ ...seatWatchesQuery(), enabled: useSeatWatchesOn() });
}

/** Plain words for what went wrong (SPEC §3.13). */
function failure(error: unknown): string {
  const reason = error instanceof ApiCallError ? error.reason : "network";
  switch (reason) {
    case "network":
      return "Couldn't reach Terpsicle. Check your connection and try again.";
    case "unauthorized":
      return "You've been signed out. Sign in again to watch for seats.";
    case "rate-limited":
      return "That's a lot of changes at once. Wait a few minutes, then try again.";
    default:
      return "Something went wrong on our side. Try again in a minute.";
  }
}

/** The server answered, but didn't start the watch. */
class WatchRefused extends Error {
  constructor(
    readonly result: Exclude<SeatWatchResult, { status: "watching" }>,
  ) {
    super(result.status);
  }
}

/** Why a watch didn't start, in plain words. */
function refusal(error: unknown, label: string): string {
  if (!(error instanceof WatchRefused)) return failure(error);
  switch (error.result.status) {
    case "too-many":
      return `You're watching ${error.result.max} sections, the most at once. Stop one to watch ${label}.`;
    case "unknown-section":
      return `Testudo doesn't list ${label} anymore, so there's nothing to watch.`;
    case "unavailable":
      return "Watching for seats is turned off right now.";
  }
}

const TOAST_ID = "seat-watch";

/**
 * Changes the cached list, while signed in only: an answer that lands
 * after signing out can't put a list back.
 */
function updateList(
  client: QueryClient,
  update: (
    watches: readonly SeatWatch[] | undefined,
  ) => readonly SeatWatch[] | undefined,
): void {
  if (useAccount.getState().status !== "signed-in") return;
  client.setQueryData(seatWatchesKey, update);
}

/**
 * Before a change shows: a list on its way would land over it. One still
 * loading for the first time is stopped too, and the change starts a list
 * (as a click before the list loads always has); the list is asked for
 * again once the change settles.
 */
async function holdList(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: seatWatchesKey });
}

/**
 * Once the last of a run of changes has settled, the server's list, over
 * whatever came back on the way. An earlier change's refresh would land
 * over a later one still on its way, so it waits for the last.
 */
function settleList(client: QueryClient): void {
  refetchWhenRunSettles(client, seatWatchesKey, () => {
    void client.invalidateQueries({ queryKey: seatWatchesKey });
  });
}

interface WatchVariables {
  termId: TermId;
  sectionKey: SectionKey;
  /** Started as the person came back from signing in (analytics). */
  signedInFirst?: boolean;
}

/**
 * Starting a watch: the bell shows Watching at once, the server's watch
 * takes its place, and "Watching …" in a toast, whose Undo stops it again.
 * A refusal (too many, gone, turned off) or a failure puts the list back
 * and says why.
 */
export function watchSeatMutation() {
  return mutationOptions({
    mutationKey: seatWatchesKey,
    mutationFn: async ({ termId, sectionKey }: WatchVariables) => {
      const result = await seatWatchesApi().watch({ termId, sectionKey });
      if (result.status !== "watching") throw new WatchRefused(result);
      return result.watch;
    },
    onMutate: async ({ termId, sectionKey }, { client }) => {
      await holdList(client);
      const had = findSeatWatch(cachedSeatWatches(client), termId, sectionKey);
      if (!had)
        updateList(client, (watches) =>
          withSeatWatch(watches, {
            termId,
            sectionKey,
            createdAt: new Date().toISOString(),
            lastNotifiedAt: null,
          }),
        );
      return { had };
    },
    onSuccess: (
      watch,
      { termId, sectionKey, signedInFirst },
      _,
      { client },
    ) => {
      updateList(client, (watches) => withSeatWatch(watches, watch));
      track("seat_watch_started", { signedInFirst: signedInFirst ?? false });
      // A seat alert just turned on: the moment to ask for notifications
      // here (V2 §6.7), or else to offer the app (§3.4). One ask, not two.
      void askAtWatch(signedInFirst ?? false);
      undoToast({
        id: TOAST_ID,
        message: `Watching ${sectionLabel(sectionKey)}`,
        description: "We'll let you know when a seat opens.",
        onUndo: () =>
          void stopWatching(client, termId, sectionKey, { undo: true }),
      });
    },
    onError: (error, { termId, sectionKey }, before, { client }) => {
      // Only the watch this put up comes down: one that was on already
      // stays on.
      if (before && !before.had)
        updateList(client, (watches) =>
          withoutSeatWatch(watches, termId, sectionKey),
        );
      noteToast(refusal(error, sectionLabel(sectionKey)), { id: TOAST_ID });
    },
    onSettled: (_data, _error, _variables, _before, { client }) =>
      settleList(client),
  });
}

interface StopVariables {
  termId: TermId;
  sectionKey: SectionKey;
  /** The Undo of a watch just started: the toast just says so. */
  undo?: boolean;
}

/**
 * Stopping a watch: gone from every list at once, with Undo in the toast
 * (a note instead when it undoes a watch just started). A failure puts it
 * back and says why.
 */
export function stopWatchingMutation() {
  return mutationOptions({
    mutationKey: seatWatchesKey,
    mutationFn: ({ termId, sectionKey }: StopVariables) =>
      seatWatchesApi().unwatch({ termId, sectionKey }),
    onMutate: async ({ termId, sectionKey }, { client }) => {
      await holdList(client);
      const before = findSeatWatch(
        cachedSeatWatches(client),
        termId,
        sectionKey,
      );
      updateList(client, (watches) =>
        withoutSeatWatch(watches, termId, sectionKey),
      );
      return { before };
    },
    onSuccess: (_result, { termId, sectionKey, undo }, _, { client }) => {
      track("seat_watch_stopped", {});
      const label = sectionLabel(sectionKey);
      if (undo) noteToast(`Not watching ${label}`, { id: TOAST_ID });
      else
        undoToast({
          id: TOAST_ID,
          message: `Stopped watching ${label}`,
          description: "No more notifications about it.",
          onUndo: () => void watchSeat(client, termId, sectionKey),
        });
    },
    onError: (error, _variables, context, { client }) => {
      const before = context?.before;
      if (before)
        updateList(client, (watches) => withSeatWatch(watches, before));
      noteToast(failure(error), { id: TOAST_ID });
    },
    onSettled: (_data, _error, _variables, _before, { client }) =>
      settleList(client),
  });
}

/**
 * Runs a mutation outside a component: the toast's Undo outlives the bell
 * that started it, and a watch asked for before signing in has no bell.
 * True once the server has done it.
 */
function run<TData, TVariables, TContext>(
  client: QueryClient,
  options: ReturnType<
    typeof mutationOptions<TData, Error, TVariables, TContext>
  >,
  variables: TVariables,
): Promise<boolean> {
  return new MutationObserver(client, options).mutate(variables).then(
    () => true,
    () => false,
  );
}

/** Starts watching (see `watchSeatMutation`). */
export function watchSeat(
  client: QueryClient,
  termId: TermId,
  sectionKey: SectionKey,
  { signedInFirst = false }: { signedInFirst?: boolean } = {},
): Promise<boolean> {
  return run(client, watchSeatMutation(), {
    termId,
    sectionKey,
    signedInFirst,
  });
}

/** Stops watching (see `stopWatchingMutation`). */
export function stopWatching(
  client: QueryClient,
  termId: TermId,
  sectionKey: SectionKey,
  { undo = false }: { undo?: boolean } = {},
): Promise<boolean> {
  return run(client, stopWatchingMutation(), { termId, sectionKey, undo });
}

/**
 * The seat-watch moment's ask: notifications on this device where the page
 * has a place for the card (course details) or on an iPhone tab (the
 * three steps); otherwise, as before, the install prompt. The ask's code
 * loads on first use, apart from the scheduler's.
 */
async function askAtWatch(signedInFirst: boolean): Promise<void> {
  // Back from signing in on a course's page, its drill-in may still be
  // mounting (the phone's drawer loads on its own): the card waits for it.
  const onCourse = window.location.pathname.startsWith(
    COURSE_PATH.replace("$code", ""),
  );
  const asked = await import("~/features/notifications/push-ask").then(
    (m) =>
      m.askForPush("seat-watch", new Date(), {
        waitForPage: signedInFirst && onCourse,
      }),
    () => null,
  );
  if (asked === null) requestInstallPrompt("alert-on");
}

// ---------- a watch asked for while signed out ----------

/**
 * The bell remembers the section before sending the person to sign in, and
 * the app starts the watch when they come back to this tab. sessionStorage
 * outlives the trip to Google and back, but not the tab.
 */
export const PENDING_WATCH_KEY = "terpsicle:pending-watch";

/** A sign-in that takes longer than this was abandoned. */
const PENDING_WATCH_MS = 30 * 60_000;

const PendingWatchSchema = z.object({
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
  at: IsoDateTimeSchema,
});

export function rememberPendingWatch(
  termId: TermId,
  sectionKey: SectionKey,
  now: Date = new Date(),
): void {
  try {
    sessionStorage.setItem(
      PENDING_WATCH_KEY,
      JSON.stringify({ termId, sectionKey, at: now.toISOString() }),
    );
  } catch {
    // Blocked storage: after sign-in, one more click starts the watch.
  }
}

/** The watch asked for before signing in, if recent; read once. */
export function takePendingWatch(
  now: Date = new Date(),
): { termId: TermId; sectionKey: SectionKey } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_WATCH_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(PENDING_WATCH_KEY);
    const parsed = PendingWatchSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (now.getTime() - Date.parse(parsed.data.at) > PENDING_WATCH_MS)
      return null;
    return { termId: parsed.data.termId, sectionKey: parsed.data.sectionKey };
  } catch {
    return null;
  }
}

/**
 * Keeps the list in step with the account: asks for it once someone is
 * signed in (then starts a watch they asked for before signing in), and
 * forgets it on sign-out or when someone else signs in.
 */
export function useSeatWatchesSync(): void {
  const client = useQueryClient();
  const status = useAccount((s) => s.status);
  const userId = useAccount((s) => s.user?.id ?? null);
  const on = useSeatWatchesOn();
  // The one observer that's always on while signed in in the shell: what
  // asks again on focus and after each change.
  useSeatWatches();
  const listedFor = useRef<string | null>(null);
  useEffect(() => {
    const forget = () => {
      // A list on its way would land after the reset.
      void client
        .cancelQueries({ queryKey: seatWatchesKey })
        .then(() => client.resetQueries({ queryKey: seatWatchesKey }));
    };
    if (!on || userId === null) {
      if (status === "signed-out") {
        listedFor.current = null;
        if (cachedSeatWatches(client) !== undefined) forget();
      }
      return;
    }
    if (listedFor.current !== null && listedFor.current !== userId) forget();
    listedFor.current = userId;
    void (async () => {
      // Offline or signed out meanwhile: bells show "Watch for a seat", and
      // a click still works (watching is idempotent). Settings says the
      // list didn't load, with Try again.
      const watches = await client
        .ensureQueryData(seatWatchesQuery())
        .catch(() => undefined);
      const pending = takePendingWatch();
      if (!pending) return;
      if (!findSeatWatch(watches, pending.termId, pending.sectionKey))
        await watchSeat(client, pending.termId, pending.sectionKey, {
          signedInFirst: true,
        });
    })();
  }, [on, status, userId, client]);
}
