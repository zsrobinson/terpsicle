// Called by the seats cron after it publishes a new seats file: emails every
// active watcher whose full section just reopened (DATA.md §7.1).
import type { SeatsFile } from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { pruneCounters, windowStart } from "../counters";
import { catalogReader } from "./catalog";
import { renderSeatOpenEmail } from "./email";
import { sendAlertEmail } from "./send";
import {
  ALERT_LIMITS,
  type AlertsEnv,
  alertsEnabled,
  issueToken,
  sectionRef,
} from "./service";
import {
  activeSubscriptions,
  countSends,
  pruneTokens,
  recordCheck,
} from "./store";

/** Links in alert emails: crons have no request, so always production. */
export const ALERTS_ORIGIN = "https://terpsicle.com";

export interface NotifyResult {
  checked: number;
  sent: number;
  /** Set when nothing ran. */
  skipped?: "disabled";
}

/**
 * `before` is the previous seats file for the term (null on the first run);
 * `after` the one just published. A section "reopened" when it had 0 open
 * seats before (or at the subscriber's last check) and has some now.
 */
export async function notifySeatChanges(
  env: AlertsEnv,
  before: SeatsFile | null,
  after: SeatsFile,
  options: { now: Date; waitUntil?: (promise: Promise<unknown>) => void },
): Promise<NotifyResult> {
  if (!alertsEnabled(env)) return { checked: 0, sent: 0, skipped: "disabled" };
  const { now } = options;
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const findSection = catalogReader(env.DATA);
  // One dedupe key per seats snapshot, so a retried cron run can't send twice.
  const snapshot = after.asOf ?? windowStart(now, 30 * 60).toISOString();

  const updates: D1PreparedStatement[] = [];
  let sent = 0;
  const subscriptions = await activeSubscriptions(env.DB, after.termId);
  for (const sub of subscriptions) {
    const seats = after.seats[sub.section_key];
    if (!seats) continue; // No counts ("Seats unknown"): nothing to compare.
    const [open, total, waitlist] = seats;
    const previous = before?.seats[sub.section_key]?.[0] ?? sub.last_open;
    const reopened = previous === 0 && open > 0;
    const coolingDown =
      sub.last_notified_at !== null &&
      now.getTime() - Date.parse(sub.last_notified_at) <
        ALERT_LIMITS.alertCooldownMs;

    let notified = false;
    if (reopened && !coolingDown) {
      const underCap =
        (await countSends(env.DB, sub.email, ["seat-open"], since)) <
        ALERT_LIMITS.alertsPerAddressPerDay;
      const found = underCap
        ? await findSection(sub.term_id, sub.section_key)
        : null;
      if (found) {
        const manage = await issueToken(env.DB, sub.id, "manage", now);
        notified = await sendAlertEmail(env, {
          to: sub.email,
          subscriptionId: sub.id,
          kind: "seat-open",
          dedupeKey: `seat-open:${sub.id}:${snapshot}`,
          email: renderSeatOpenEmail(
            ALERTS_ORIGIN,
            sectionRef(found),
            { open, total, waitlist, asOf: after.asOf },
            manage.token,
          ),
          now,
        });
        if (notified) sent++;
      }
    }
    if (notified || sub.last_open !== open) {
      updates.push(recordCheck(env.DB, sub.id, open, nowIso, notified));
    }
  }
  if (updates.length > 0) await env.DB.batch(updates);
  await Promise.all([pruneCounters(env.DB, now), pruneTokens(env.DB, now)]);
  if (sent > 0) {
    options.waitUntil?.(
      captureServerEvent(env, "alert_sent", {
        termId: after.termId,
        count: sent,
      }),
    );
  }
  return { checked: subscriptions.length, sent };
}
