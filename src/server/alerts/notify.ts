// Called by the seats cron after it publishes a new seats file: tells every
// person whose watched section just reopened (DATA.md §7.1), by email and web
// push, each as their notification settings say (V2.md §6.5). Email keeps
// this folder's own path (seat_alert_sends: dedupe, the daily cap, the
// one-click stop); push goes through ~/server/notifications.
import { channelOn } from "~/core/notifications";
import type { SeatsFile } from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { pruneCounters, windowStart } from "../counters";
import { type NotifyEnv, notify } from "../notifications/notify";
import { countDeliveries, readSettings } from "../notifications/store";
import { catalogReader } from "./catalog";
import { courseUrl, renderSeatOpenEmail } from "./email";
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
  env: AlertsEnv & Omit<NotifyEnv, "DB" | "EMAIL">,
  before: SeatsFile | null,
  after: SeatsFile,
  options: {
    now: Date;
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Where email links point; the harness passes its own. */
    origin?: string;
    /** Outbound fetch for push services; tests fake it. */
    fetch?: typeof fetch;
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
      // Each alert sends at most one email and one push, so the busier
      // channel is the count.
      const sentToday = Math.max(
        await countSends(env.DB, w.user_id, since),
        await countDeliveries(env.DB, {
          userId: w.user_id,
          type: "seat-open",
          channel: "push",
          since: new Date(since),
        }),
      );
      const underCap = sentToday < ALERT_LIMITS.alertsPerUserPerDay;
      const found = underCap
        ? await findSection(w.term_id, w.section_key)
        : null;
      if (found) {
        const ref = sectionRef(found);
        const key = `seat-open:${w.user_id}:${w.term_id}:${w.section_key}:${snapshot}`;
        const link = new URL(courseUrl(origin, ref));
        const pushed = await notify(
          env,
          w.user_id,
          {
            type: "seat-open",
            key,
            push: {
              title: `A seat opened in ${ref.courseCode} ${ref.sectionCode}`,
              body: `${open} of ${total} open. Register on Testudo before it's gone.`,
              url: `${link.pathname}${link.search}`,
              tag: `seat:${w.term_id}:${w.section_key}`,
            },
          },
          { now, ...(options.fetch ? { fetch: options.fetch } : {}) },
        );
        const emailOn = channelOn(
          await readSettings(env.DB, w.user_id),
          "seat-open",
          "email",
        );
        const stop = await oneClickStopUrl(env.DATA, origin, {
          userId: w.user_id,
          termId: w.term_id,
          sectionKey: w.section_key,
        });
        const emailed =
          emailOn &&
          (await sendAlertEmail(env, {
            to: w.email,
            userId: w.user_id,
            termId: w.term_id,
            sectionKey: w.section_key,
            dedupeKey: `${key}:email`,
            email: renderSeatOpenEmail(
              origin,
              ref,
              { open, total, waitlist, asOf: after.asOf },
              stop,
            ),
            now,
          }));
        notified = emailed || pushed.push === "sent";
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
