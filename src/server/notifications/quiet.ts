// Quiet hours' morning (docs/V2.md §6.7): pushes held between 11pm and 8am
// New York go at 8am, one per group, worded for the whole group as the
// inbox words it ("3 mentions in CMSC351"). The every-5-minutes cron runs
// this; outside quiet hours it's one look at a tiny index, empty most of
// the day. A group read in the night sends nothing, and a type turned off
// since sends nothing.
import { channelOn, deliveryKey, inQuietHours } from "~/core/notifications";
import { InboxTypeSchema } from "~/core/schema/notifications";
import type { CourseChatNamespace } from "../chat/course-chat";
import { pushConfig } from "../push/config";
import { subscriptionsOf } from "../push/store";
import {
  heldGroups,
  takeHeldGroup,
  unreadCount,
  unreadGroupItem,
} from "./inbox";
import { inboxItems } from "./inbox-items";
import { type NotifyEnv, type NotifyOptions, pushToDevices } from "./notify";
import { claimDelivery, finishDelivery, readSettings } from "./store";

export type QuietEnv = NotifyEnv & {
  /** Where chat groups' words come from, as the inbox gets them. */
  COURSE_CHAT?: CourseChatNamespace;
};

/** Groups one run sends at most; the next run, 5 minutes on, takes the rest. */
export const RELEASE_MAX = 500;

export interface ReleaseReport {
  /** Groups that were waiting and were taken. */
  groups: number;
  /** Pushes that reached at least one device. */
  sent: number;
}

/** Sends each group that waited through quiet hours as one push, once it's 8am. */
export async function releaseHeldPushes(
  env: QuietEnv,
  options: NotifyOptions,
): Promise<ReleaseReport> {
  const report: ReleaseReport = { groups: 0, sent: 0 };
  if (inQuietHours(options.now)) return report;
  const groups = await heldGroups(env.DB, RELEASE_MAX);
  for (const { userId, groupKey } of groups) {
    if (!(await takeHeldGroup(env.DB, userId, groupKey))) continue;
    report.groups += 1;
    if (await releaseGroup(env, userId, groupKey, options)) report.sent += 1;
  }
  return report;
}

/** One group's push at 8am. True when a device took it. */
async function releaseGroup(
  env: QuietEnv,
  userId: string,
  groupKey: string,
  options: NotifyOptions,
): Promise<boolean> {
  const row = await unreadGroupItem(env.DB, userId, groupKey);
  if (!row) return false;
  const type = InboxTypeSchema.parse(row.type);
  const settings = await readSettings(env.DB, userId);
  if (type !== "admin-urgent" && !channelOn(settings, type, "push"))
    return false;
  const devices = await subscriptionsOf(env.DB, userId);
  if (devices.length === 0) return false;
  // A chat message deleted or held in the night drops out, as in the inbox.
  const [item] = await inboxItems(env.COURSE_CHAT, userId, [row], {
    showText: settings.showText,
  });
  if (!item) return false;
  const claim = {
    userId,
    type,
    channel: "push" as const,
    dedupeKey: deliveryKey(
      `quiet:${userId}:${groupKey}:${options.now.toISOString()}`,
      "push",
    ),
    now: options.now,
  };
  const config = pushConfig(
    env,
    options.testMode ?? env.AUTH_TEST_MODE === "true",
  );
  if (!config.enabled) {
    await claimDelivery(env.DB, { ...claim, status: "skipped" });
    return false;
  }
  const id = await claimDelivery(env.DB, { ...claim, status: "failed" });
  if (id === null) return false;
  const badge = await unreadCount(env.DB, userId);
  const { sent, statuses } = await pushToDevices(
    env,
    config,
    devices,
    type,
    () => ({
      title: item.title,
      body: item.body,
      url: item.url,
      tag: groupKey,
      count: item.count,
      badge,
      // Morning: everything that waited arrives together, without a buzz
      // for each (one that replaces nothing still shows as new).
      renotify: false,
      id: item.id,
    }),
    options,
  );
  const status = sent > 0 ? "sent" : "failed";
  await finishDelivery(env.DB, id, status, statuses.slice(0, 200));
  return sent > 0;
}
