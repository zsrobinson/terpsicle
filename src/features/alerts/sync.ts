import type { LocalSeatAlert } from "~/core/schema";
import { ApiCallError, api } from "~/server/fns/api";
import { useSeatAlerts } from "~/state/seat-alerts";
import { clearAlertsInbox, type InboxEntry, readAlertsInbox } from "./inbox";

// Startup work for this browser's seat alerts (DATA.md §5, §7.1): take in what
// the confirm page left behind, then ask the server how every watch stands.

export type AlertsClient = Pick<typeof api.alerts, "status">;

/**
 * The inbox's entries folded into the local list: a confirmed watch gets its
 * id and manage token (and a row, if it was asked for in another browser);
 * one stopped from the unsubscribe page goes away.
 */
export function mergeInbox(
  alerts: readonly LocalSeatAlert[],
  inbox: readonly InboxEntry[],
): { put: LocalSeatAlert[]; remove: LocalSeatAlert[] } {
  const put: LocalSeatAlert[] = [];
  const remove: LocalSeatAlert[] = [];
  // Oldest first, so the latest word on a watch wins.
  const ordered = [...inbox].sort((a, b) => a.at.localeCompare(b.at));
  const current = new Map<string, LocalSeatAlert>(
    alerts.map((a) => [`${a.termId}|${a.sectionKey}`, a]),
  );
  for (const entry of ordered) {
    const key = `${entry.termId}|${entry.sectionKey}`;
    const existing = current.get(key);
    if (entry.status === "unsubscribed") {
      if (existing) remove.push(existing);
      current.delete(key);
      continue;
    }
    const row: LocalSeatAlert = {
      termId: entry.termId,
      sectionKey: entry.sectionKey,
      email: existing?.email ?? null,
      status: "active",
      subscriptionId: entry.subscriptionId,
      manageToken: entry.manageToken,
      createdAt: existing?.createdAt ?? entry.at,
      updatedAt: entry.at,
    };
    current.set(key, row);
    put.push(row);
  }
  const removedKeys = new Set(remove.map((r) => `${r.termId}|${r.sectionKey}`));
  return {
    put: put.filter((r) => !removedKeys.has(`${r.termId}|${r.sectionKey}`)),
    remove,
  };
}

/** Moves the confirm page's hand-off into the local list, then clears it. */
export async function importAlertsInbox(): Promise<void> {
  const inbox = readAlertsInbox();
  if (inbox.length === 0) return;
  const store = useSeatAlerts.getState();
  const { put, remove } = mergeInbox(store.alerts, inbox);
  await store.put(put);
  for (const r of remove) await store.remove(r.termId, r.sectionKey);
  // Only once the rows have landed, so a failed write can retry next load.
  clearAlertsInbox();
}

/**
 * Asks the server about every watch this browser holds a token for. Sent even
 * with none: the answer says whether seat alerts are on at all.
 */
export async function refreshSeatAlerts(
  now: Date,
  client: AlertsClient = api.alerts,
): Promise<void> {
  const store = useSeatAlerts.getState();
  const tracked = store.alerts.flatMap((a) =>
    a.subscriptionId && a.manageToken
      ? [{ alert: a, subscriptionId: a.subscriptionId, token: a.manageToken }]
      : [],
  );
  // The endpoint takes 50 at a time.
  const batches: (typeof tracked)[] = [];
  for (let i = 0; i < tracked.length || i === 0; i += 50)
    batches.push(tracked.slice(i, i + 50));
  for (const batch of batches) {
    let result: Awaited<ReturnType<AlertsClient["status"]>>;
    try {
      result = await client.status({
        items: batch.map((t) => ({
          subscriptionId: t.subscriptionId,
          manageToken: t.token,
        })),
      });
    } catch (error) {
      if (error instanceof ApiCallError && error.reason === "unavailable")
        store.setAvailability("unavailable");
      // Offline or rate-limited: keep what we know and try on the next load.
      return;
    }
    if (result.status === "unavailable") {
      store.setAvailability("unavailable");
      return;
    }
    store.setAvailability("available");
    const updated: LocalSeatAlert[] = [];
    for (const [i, item] of result.items.entries()) {
      const alert = batch[i]?.alert;
      if (!alert || alert.subscriptionId !== item.subscriptionId) continue;
      if (item.status === "unsubscribed" || item.status === "unknown") {
        await store.remove(alert.termId, alert.sectionKey);
      } else if (item.status !== alert.status) {
        updated.push({
          ...alert,
          status: item.status,
          updatedAt: now.toISOString(),
        });
      }
    }
    await store.put(updated);
  }
}

/** Everything the app does with seat alerts on startup, once the list has loaded. */
export async function syncSeatAlerts(
  now: Date,
  client: AlertsClient = api.alerts,
): Promise<void> {
  await importAlertsInbox();
  await refreshSeatAlerts(now, client);
}
