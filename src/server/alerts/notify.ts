// Called by the seats cron after it publishes a new seats file: tells every
// person whose watched section just reopened (DATA.md §7.1), in their inbox
// and by email and web push as their notification settings say (V2.md
// §6.5, §6.7). Every section that opened for one person in one run is one
// push and one email: "Seats opened in 3 sections you're watching". Email
// keeps this folder's own path (seat_alert_sends: dedupe, the daily cap,
// the one-click stop); the inbox and push go through ~/server/notifications.
import { channelOn, seatTag } from "~/core/notifications";
import type { SeatsFile } from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { pruneCounters, windowStart } from "../counters";
import { emailOffUrl } from "../notifications/email-off";
import { countInboxEvents } from "../notifications/inbox";
import { type NotifyEnv, notify } from "../notifications/notify";
import { countDeliveries, readSettings } from "../notifications/store";
import { catalogReader } from "./catalog";
import {
  courseUrl,
  type OpenedSection,
  renderSeatOpenEmail,
  renderSeatsOpenEmail,
  type SectionRef,
} from "./email";
import { sendAlertEmail } from "./send";
import {
  ALERT_LIMITS,
  type AlertsEnv,
  alertsEnabled,
  oneClickStopUrl,
  sectionRef,
} from "./service";
import { countSends, pruneSends, recordCheck, watchesInTerm } from "./store";

type WatchRow = Awaited<ReturnType<typeof watchesInTerm>>[number];

/** Links in alert emails: crons have no request, so always production. */
export const ALERTS_ORIGIN = "https://terpsicle.com";

export interface NotifyResult {
  checked: number;
  sent: number;
  /** Set when nothing ran. */
  skipped?: "disabled";
}

/** A watched section that reopened in this run, past the cooldown and the cap. */
interface Opened extends OpenedSection {
  watch: WatchRow;
  /** This section's event: `seat-open:<user>:<term>:<section>:<snapshot>`. */
  key: string;
}

/** Seat-open alerts this person got in the last day, on any channel (the daily cap). */
async function alertsToday(
  db: D1Database,
  userId: string,
  since: Date,
): Promise<number> {
  // Each section alert is one inbox row and at most one email row; a
  // seats run's push counts once. The busiest record is the count.
  const [emails, pushes, inbox] = await Promise.all([
    countSends(db, userId, since.toISOString()),
    countDeliveries(db, { userId, type: "seat-open", channel: "push", since }),
    countInboxEvents(db, userId, "seat-open", since),
  ]);
  return Math.max(emails, pushes, inbox);
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
  const since = new Date(now.getTime() - 86_400_000);
  const findSection = catalogReader(env.DATA);
  // One dedupe key per seats snapshot, so a retried cron run can't send twice.
  const snapshot = after.asOf ?? windowStart(now, 30 * 60).toISOString();

  const watches = await watchesInTerm(env.DB, after.termId);
  const opened = new Map<string, Opened[]>();
  const counts = new Map<string, number>();
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
    if (!reopened || coolingDown) continue;
    // This run's sections count toward the cap as they're found.
    const sentToday =
      counts.get(w.user_id) ?? (await alertsToday(env.DB, w.user_id, since));
    counts.set(w.user_id, sentToday);
    if (sentToday >= ALERT_LIMITS.alertsPerUserPerDay) continue;
    const found = await findSection(w.term_id, w.section_key);
    if (!found) continue;
    counts.set(w.user_id, sentToday + 1);
    opened.set(w.user_id, [
      ...(opened.get(w.user_id) ?? []),
      {
        watch: w,
        ref: sectionRef(found),
        seats: { open, total, waitlist, asOf: after.asOf },
        key: `seat-open:${w.user_id}:${w.term_id}:${w.section_key}:${snapshot}`,
      },
    ]);
  }

  const notified = new Set<WatchRow>();
  let sent = 0;
  for (const [userId, sections] of opened) {
    const delivered = await notifyOnePerson(env, userId, sections, {
      ...options,
      origin,
      snapshot,
    });
    for (const s of delivered.notified) notified.add(s.watch);
    if (delivered.sent) sent += sections.length;
  }

  const updates = watches.flatMap((w) => {
    const open = after.seats[w.section_key]?.[0];
    if (open === undefined) return [];
    const was = notified.has(w);
    return was || w.last_open !== open
      ? [recordCheck(env.DB, w, open, nowIso, was)]
      : [];
  });
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

/** "CMSC351 0101". */
const labelOf = (ref: SectionRef) => `${ref.courseCode} ${ref.sectionCode}`;

/**
 * One person's sections from one run: an inbox row each, one push for the
 * group and one email. `notified` are the sections that reached the inbox
 * (their cooldown starts); `sent` is whether a push or an email went.
 */
async function notifyOnePerson(
  env: AlertsEnv & Omit<NotifyEnv, "DB" | "EMAIL"> & { EMAIL: SendEmail },
  userId: string,
  sections: readonly Opened[],
  options: {
    now: Date;
    origin: string;
    snapshot: string;
    fetch?: typeof fetch;
  },
): Promise<{ notified: readonly Opened[]; sent: boolean }> {
  const { now, origin } = options;
  const [first] = sections;
  if (!first) return { notified: [], sent: false };
  const termId = first.watch.term_id;
  const rows = sections.map((s) => {
    const link = new URL(courseUrl(origin, s.ref));
    const label = labelOf(s.ref);
    return {
      id: s.key,
      groupKey: seatTag(termId),
      title: `A seat opened in ${label}`,
      body: `${s.seats.open} of ${s.seats.total} open. Register on Testudo before it's gone.`,
      label,
      url: `${link.pathname}${link.search}`,
      termId,
      courseCode: s.ref.courseCode,
    };
  });
  const [newest] = rows;
  if (!newest) return { notified: [], sent: false };
  const pushed = await notify(
    env,
    userId,
    {
      type: "seat-open",
      key: `seat-open:${userId}:${termId}:${options.snapshot}`,
      inbox: rows,
      push: {
        event: { type: "seat-open", title: newest.title, body: newest.body },
        url: newest.url,
      },
    },
    { now, ...(options.fetch ? { fetch: options.fetch } : {}) },
  );
  const emailOn = channelOn(
    await readSettings(env.DB, userId),
    "seat-open",
    "email",
  );
  const email =
    sections.length === 1
      ? renderSeatOpenEmail(
          origin,
          first.ref,
          first.seats,
          await oneClickStopUrl(env.DATA, origin, {
            userId,
            termId,
            sectionKey: first.watch.section_key,
          }),
        )
      : renderSeatsOpenEmail(
          origin,
          sections,
          await emailOffUrl(env.DATA, origin, userId, "seat-open"),
        );
  const emailed =
    emailOn &&
    (await sendAlertEmail(env, {
      to: first.watch.email,
      userId,
      sections: sections.map((s) => ({
        termId: s.watch.term_id,
        sectionKey: s.watch.section_key,
        dedupeKey: `${s.key}:email`,
      })),
      email,
      now,
    }));
  return {
    // A retried run finds the rows written: nothing new, no cooldown reset.
    notified: pushed.inbox === "new" ? sections : [],
    sent: emailed || pushed.push === "sent",
  };
}
