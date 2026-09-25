import { useMemo } from "react";
import { track } from "~/app/analytics";
import {
  type LocalSeatAlert,
  type SectionKey,
  SubscribeInputSchema,
  type TermId,
} from "~/core/schema";
import { ApiCallError, api } from "~/server/fns/api";
import { findSeatAlert, useSeatAlerts } from "~/state/seat-alerts";

// The seat-alert actions and hooks the rest of the app uses: the bell in
// course details (subscribe, "You're already watching this") and Export's
// list (stop watching). SPEC §3.12, DATA.md §7.1.

/** How one section's watch looks from this browser. */
export type SeatAlertState =
  /** The server said seat alerts are off: show no bell, no list. */
  | { kind: "unavailable" }
  | { kind: "none" }
  /** Asked for; waiting on the confirmation link. */
  | { kind: "pending"; alert: LocalSeatAlert }
  | { kind: "watching"; alert: LocalSeatAlert };

/** Confirmation links work for 48 hours (DATA.md §7.1). */
export const CONFIRM_LINK_MS = 48 * 3_600_000;

export function seatAlertState(
  alert: LocalSeatAlert | undefined,
  availability: ReturnType<typeof useSeatAlerts.getState>["availability"],
  now: Date = new Date(),
): SeatAlertState {
  if (availability === "unavailable") return { kind: "unavailable" };
  if (!alert) return { kind: "none" };
  if (alert.status === "active") return { kind: "watching", alert };
  // A request whose link has expired offers the bell again.
  if (
    alert.status === "pending" &&
    now.getTime() - Date.parse(alert.updatedAt) < CONFIRM_LINK_MS
  )
    return { kind: "pending", alert };
  return { kind: "none" };
}

/** The bell's state for one section. */
export function useSeatAlert(
  termId: TermId,
  sectionKey: SectionKey,
): SeatAlertState {
  const alert = useSeatAlerts((s) =>
    findSeatAlert(s.alerts, termId, sectionKey),
  );
  const availability = useSeatAlerts((s) => s.availability);
  return useMemo(
    () => seatAlertState(alert, availability),
    [alert, availability],
  );
}

/** Whether to offer seat alerts at all (false once the server says they're off). */
export function useSeatAlertsAvailable(): boolean {
  return useSeatAlerts((s) => s.availability !== "unavailable");
}

/** The address used last in this browser, to prefill the bell. */
export function useLastSeatAlertEmail(): string | null {
  return useSeatAlerts((s) => {
    let latest: LocalSeatAlert | null = null;
    for (const a of s.alerts)
      if (a.email && (!latest || a.updatedAt > latest.updatedAt)) latest = a;
    return latest?.email ?? null;
  });
}

/** This browser's watches, newest first; a term narrows the list. */
export function useSeatAlertList(termId?: TermId): readonly LocalSeatAlert[] {
  const alerts = useSeatAlerts((s) => s.alerts);
  return useMemo(
    () =>
      alerts
        .filter(
          (a) =>
            seatAlertState(a, "available").kind !== "none" &&
            (termId === undefined || a.termId === termId),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [alerts, termId],
  );
}

export type SubscribeOutcome =
  /** Sent (or re-sent): "Check your email to confirm." */
  | { status: "check-email" }
  /** This browser already watches it: "You're already watching this." */
  | { status: "already-watching" }
  | { status: "invalid-email" }
  | { status: "unknown-section" }
  | { status: "rate-limited"; retryAfterSeconds: number }
  | { status: "unavailable" }
  | { status: "error"; reason: "network" | "bad-response" };

/**
 * The bell's "Watch" button: asks for a confirmation email and writes a
 * pending row. Everything a person could hit comes back as an outcome, never
 * a throw, with words for it in `subscribeMessage`.
 */
export async function subscribeSeatAlert(
  email: string,
  termId: TermId,
  sectionKey: SectionKey,
  {
    now = new Date(),
    client = api.alerts,
  }: { now?: Date; client?: Pick<typeof api.alerts, "subscribe"> } = {},
): Promise<SubscribeOutcome> {
  const store = useSeatAlerts.getState();
  const existing = findSeatAlert(store.alerts, termId, sectionKey);
  if (existing?.status === "active") return { status: "already-watching" };
  const input = SubscribeInputSchema.safeParse({ email, termId, sectionKey });
  if (!input.success) return { status: "invalid-email" };

  let result: Awaited<ReturnType<typeof client.subscribe>>;
  try {
    result = await client.subscribe(input.data);
  } catch (error) {
    const reason = error instanceof ApiCallError ? error.reason : "network";
    if (reason === "unavailable") {
      store.setAvailability("unavailable");
      return { status: "unavailable" };
    }
    return {
      status: "error",
      reason: reason === "bad-response" ? "bad-response" : "network",
    };
  }
  if (result.status === "unavailable") store.setAvailability("unavailable");
  if (result.status !== "check-email") return result;

  store.setAvailability("available");
  const at = now.toISOString();
  await store.put([
    {
      termId,
      sectionKey,
      email: input.data.email,
      status: "pending",
      subscriptionId: existing?.subscriptionId ?? null,
      manageToken: existing?.manageToken ?? null,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    },
  ]);
  track("seat_alert_requested", {});
  return { status: "check-email" };
}

/** Plain words for each outcome (SPEC §3.13: specific, active voice). */
export function subscribeMessage(outcome: SubscribeOutcome): string {
  switch (outcome.status) {
    case "check-email":
      return "Check your email. Click the link there to start watching.";
    case "already-watching":
      return "You're already watching this.";
    case "invalid-email":
      return "That doesn't look like an email address.";
    case "unknown-section":
      return "Testudo doesn't list this section anymore, so there's nothing to watch.";
    case "rate-limited":
      return `Too many tries from this network. Try again in ${Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60))} min.`;
    case "unavailable":
      return "Seat alerts are turned off right now.";
    case "error":
      return outcome.reason === "network"
        ? "Couldn't reach Terpsicle. Check your connection and try again."
        : "Something went wrong on our side. Try again in a minute.";
  }
}

export type StopOutcome =
  | { status: "stopped" }
  /** Confirmed on another device: stop it from any alert email's link. */
  | { status: "no-token" }
  | { status: "error"; message: string };

/**
 * Export's "Stop watching", after the person confirms: unsubscribes with this
 * browser's manage token and drops the row.
 */
export async function stopSeatAlert(
  termId: TermId,
  sectionKey: SectionKey,
  {
    client = api.alerts,
  }: { client?: Pick<typeof api.alerts, "unsubscribe"> } = {},
): Promise<StopOutcome> {
  const store = useSeatAlerts.getState();
  const alert = findSeatAlert(store.alerts, termId, sectionKey);
  if (!alert) return { status: "stopped" };
  if (!alert.manageToken) {
    // Never confirmed anywhere we know of: nothing is sending email yet.
    if (alert.status === "pending") {
      await store.remove(termId, sectionKey);
      track("seat_alert_stopped", {});
      return { status: "stopped" };
    }
    return { status: "no-token" };
  }
  try {
    // "invalid-token" means the server has no such watch: it's stopped either way.
    await client.unsubscribe({ token: alert.manageToken });
  } catch (error) {
    const reason = error instanceof ApiCallError ? error.reason : "network";
    if (reason === "unavailable") store.setAvailability("unavailable");
    return {
      status: "error",
      message:
        reason === "network"
          ? "Couldn't reach Terpsicle. Check your connection and try again."
          : reason === "rate-limited"
            ? "Too many tries from this network. Wait a few minutes, then try again."
            : reason === "unavailable"
              ? "Seat alerts are turned off right now, so no emails are going out."
              : "Something went wrong on our side. Try again in a minute.",
    };
  }
  await store.remove(termId, sectionKey);
  track("seat_alert_stopped", {});
  return { status: "stopped" };
}
