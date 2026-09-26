import { Undo2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { track } from "~/app/analytics";
import { ToastAction } from "~/app/toast-action";
import {
  IsoDateTimeSchema,
  type SeatWatch,
  type SectionKey,
  SectionKeySchema,
  type TermId,
  TermIdSchema,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { requestInstallPrompt } from "~/features/pwa/install-store";
import { ApiCallError, api } from "~/server/fns/api";
import { findSeatWatch, useSeatWatches } from "~/state/seat-watches";
import { sectionLabel } from "./labels";

// Seat watches from the app's side (SPEC §3.12, V2.md §6.5): "Watch for a
// seat" on a full or low section, "Watching" once it's on. Signed in, one
// click starts or stops a watch, with Undo in the toast (no confirmations,
// DESIGN §5). Signed out, the bell offers sign-in and the watch starts as
// the person comes back.

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
  const watch = useSeatWatches((s) =>
    findSeatWatch(s.watches, termId, sectionKey),
  );
  return useMemo(
    () => seatWatchState({ status, seatAlerts }, watch),
    [status, seatAlerts, watch],
  );
}

export type SeatWatchesClient = Pick<
  typeof api.alerts,
  "watch" | "unwatch" | "list"
>;

let client: SeatWatchesClient = api.alerts;

/** Test hook: a fake API client. */
export function setSeatWatchesClient(next: SeatWatchesClient): void {
  client = next;
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

const TOAST_ID = "seat-watch";

const undoButton = (onClick: () => void) => (
  <ToastAction
    label="Undo"
    icon={<Undo2 size={13} aria-hidden="true" />}
    onClick={() => {
      toast.dismiss(TOAST_ID);
      onClick();
    }}
  />
);

/**
 * Starts watching. Shows "Watching …" (or why not) in a toast, whose Undo
 * stops it again.
 */
export async function watchSeat(
  termId: TermId,
  sectionKey: SectionKey,
  { signedInFirst = false }: { signedInFirst?: boolean } = {},
): Promise<boolean> {
  const label = sectionLabel(sectionKey);
  let result: Awaited<ReturnType<SeatWatchesClient["watch"]>>;
  try {
    result = await client.watch({ termId, sectionKey });
  } catch (error) {
    toast.error(failure(error), { id: TOAST_ID });
    return false;
  }
  switch (result.status) {
    case "watching":
      useSeatWatches.getState().put(result.watch);
      track("seat_watch_started", { signedInFirst });
      // A seat alert just turned on: the moment to offer the app (V2 §3.4).
      requestInstallPrompt("alert-on");
      toast(`Watching ${label}`, {
        id: TOAST_ID,
        description: "We'll email you when a seat opens.",
        action: undoButton(
          () => void stopWatching(termId, sectionKey, { undo: true }),
        ),
      });
      return true;
    case "too-many":
      toast.error(
        `You're watching ${result.max} sections, the most at once. Stop one to watch ${label}.`,
        { id: TOAST_ID },
      );
      return false;
    case "unknown-section":
      toast.error(
        `Testudo doesn't list ${label} anymore, so there's nothing to watch.`,
        { id: TOAST_ID },
      );
      return false;
    case "unavailable":
      toast.error("Seat alerts are turned off right now.", { id: TOAST_ID });
      return false;
  }
}

/**
 * Stops watching, at once, with Undo in the toast. `undo`: this is the Undo
 * of a watch just started, so the toast just says so.
 */
export async function stopWatching(
  termId: TermId,
  sectionKey: SectionKey,
  { undo = false }: { undo?: boolean } = {},
): Promise<boolean> {
  const label = sectionLabel(sectionKey);
  const store = useSeatWatches.getState();
  const before = findSeatWatch(store.watches, termId, sectionKey);
  store.remove(termId, sectionKey);
  try {
    await client.unwatch({ termId, sectionKey });
  } catch (error) {
    if (before) useSeatWatches.getState().put(before);
    toast.error(failure(error), { id: TOAST_ID });
    return false;
  }
  track("seat_watch_stopped", {});
  toast(undo ? `Not watching ${label}` : `Stopped watching ${label}`, {
    id: TOAST_ID,
    description: undo ? undefined : "No more emails about it.",
    action: undo
      ? undefined
      : undoButton(() => void watchSeat(termId, sectionKey)),
  });
  return true;
}

let loading: Promise<void> | null = null;

/** Loads the signed-in person's watches (once at a time). */
export function loadSeatWatches(): Promise<void> {
  loading ??= (async () => {
    try {
      const result = await client.list({});
      useSeatWatches
        .getState()
        .setAll(result.status === "ok" ? result.watches : []);
    } catch {
      // Offline or signed out meanwhile: bells show "Watch for a seat",
      // and a click still works (watching is idempotent).
    } finally {
      loading = null;
    }
  })();
  return loading;
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
 * Keeps the list in step with the account: loads it once someone is signed
 * in (then starts a watch they asked for before signing in), and forgets it
 * on sign-out.
 */
export function useSeatWatchesSync(): void {
  const status = useAccount((s) => s.status);
  const seatAlerts = useAccount((s) => s.flags.seatAlerts);
  const userId = useAccount((s) => s.user?.id ?? null);
  useEffect(() => {
    if (status !== "signed-in" || !seatAlerts || userId === null) {
      if (status === "signed-out") useSeatWatches.getState().setAll(null);
      return;
    }
    void (async () => {
      await loadSeatWatches();
      const pending = takePendingWatch();
      if (!pending) return;
      const on = findSeatWatch(
        useSeatWatches.getState().watches,
        pending.termId,
        pending.sectionKey,
      );
      if (!on)
        await watchSeat(pending.termId, pending.sectionKey, {
          signedInFirst: true,
        });
    })();
  }, [status, seatAlerts, userId]);
}
