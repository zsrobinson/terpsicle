// Called by the seats cron after it publishes a new seats file: emails every
// person whose watched section just reopened (DATA.md §7.1). Web push joins
// here once src/server/push lands (V2.md §6.4).
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
  oneClickStopUrl,
  sectionRef,
} from "./service";
import { countSends, pruneSends, recordCheck, watchesInTerm } from "./store";

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
 * seats before (or at the watch's last check) and has some now.
 */
export async function notifySeatChanges(
  env: AlertsEnv,
  before: SeatsFile | null,
  after: SeatsFile,
  options: {
    now: Date;
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Where email links point; the harness passes its own. */
    origin?: string;
  },
): Promise<NotifyResult> {
  if (!alertsEnabled(env)) return { checked: 0, sent: 0, skipped: "disabled" };
  const { now } = options;
  const origin = options.origin ?? ALERTS_ORIGIN;
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const findSection = catalogReader(env.DATA);
  // One dedupe key per seats snapshot, so a retried cron run can't send twice.
  const snapshot = after.asOf ?? windowStart(now, 30 * 60).toISOString();

  const updates: D1PreparedStatement[] = [];
  let sent = 0;
  const watches = await watchesInTerm(env.DB, after.termId);
  for (const w of watches) {
    const seats = after.seats[w.section_key];
    if (!seats) continue; // No counts ("Seats unknown"): nothing to compare.
    const [open, total, waitlist] = seats;
    const previous = before?.seats[w.section_key]?.[0] ?? w.last_open;
    const reopened = previous === 0 && open > 0;
    const coolingDown =
      w.last_notified_at !== null &&
      now.getTime() - Date.parse(w.last_notified_at) <
        ALERT_LIMITS.alertCooldownMs;

    let notified = false;
    if (reopened && !coolingDown) {
      const underCap =
        (await countSends(env.DB, w.user_id, since)) <
        ALERT_LIMITS.alertsPerUserPerDay;
      const found = underCap
        ? await findSection(w.term_id, w.section_key)
        : null;
      if (found) {
        const stop = await oneClickStopUrl(env.DATA, origin, {
          userId: w.user_id,
          termId: w.term_id,
          sectionKey: w.section_key,
        });
        notified = await sendAlertEmail(env, {
          to: w.email,
          userId: w.user_id,
          termId: w.term_id,
          sectionKey: w.section_key,
          dedupeKey: `seat-open:${w.user_id}:${w.term_id}:${w.section_key}:${snapshot}:email`,
          email: renderSeatOpenEmail(
            origin,
            sectionRef(found),
            { open, total, waitlist, asOf: after.asOf },
            stop,
          ),
          now,
        });
        if (notified) sent++;
      }
    }
    if (notified || w.last_open !== open) {
      updates.push(recordCheck(env.DB, w, open, nowIso, notified));
    }
  }
  if (updates.length > 0) await env.DB.batch(updates);
  await Promise.all([pruneCounters(env.DB, now), pruneSends(env.DB, now)]);
  if (sent > 0) {
    options.waitUntil?.(
      captureServerEvent(env, "alert_sent", {
        termId: after.termId,
        count: sent,
      }),
    );
  }
  return { checked: watches.length, sent };
}
