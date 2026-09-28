// The one way anything notifies a person (V2.md §6, §6.7): seat watches,
// chat mentions and replies, Todo's "Due tomorrow". `notify` writes the
// event's inbox rows whatever the settings say, then reads the settings,
// sends one web push per group to each device (worded for the whole
// group, with its count and the badge) and, for types with email, an
// email, and records each channel in notification_deliveries under the
// event's dedupe key, so a retried job never sends twice. Nothing is
// capped: grouping keeps a busy room to one notification.
import {
  channelOn,
  deliveryKey,
  groupWords,
  type InboxEvent,
  PUSH_DELIVERY,
  shouldRenotify,
} from "~/core/notifications";
import type { PushPayload, PushType } from "~/core/schema";
import type {
  DeliveryStatus,
  InboxType,
  NotificationType,
  PushSubscriptionRow,
  PushTestResult,
} from "~/core/schema/notifications";
import { ALERTS_FROM } from "../alerts/email";
import { type PushConfig, type PushEnv, pushConfig } from "../push/config";
import { sendPush } from "../push/send";
import { recordSend, subscriptionsOf } from "../push/store";
import {
  groupState,
  type InboxRow,
  unreadCount,
  writeInboxRows,
} from "./inbox";
import { claimDelivery, finishDelivery, readSettings } from "./store";

export interface NotifyEnv extends PushEnv {
  DB: D1Database;
  /** Previews and tests have none: email is then `skipped`. */
  EMAIL?: SendEmail;
  EMAIL_SUBJECT_PREFIX?: string;
  AUTH_TEST_MODE?: string;
}

/** An email as the sender renders it (alerts' `RenderedEmail`). */
export interface NotificationEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

export interface Notification {
  /** `admin-urgent` has no settings: its push is always on (V2 §6.7, not sent yet). */
  type: NotificationType | "admin-urgent";
  /**
   * Unique per event, the same on every retry of it:
   * `seat-open:<userId>:<term>:<snapshot>`. Each channel adds its name
   * (`…:push`, `…:email`).
   */
  key: string;
  /**
   * The inbox rows it writes, all in one group, whatever the settings say:
   * one for most events, one per section for a seats run. None for the
   * digest, an email about rows already there.
   */
  inbox?: readonly InboxRow[];
  /**
   * Push it (as the settings allow): the newest event's words, which
   * `groupWords` turns into the group's, and where a click goes. Left out
   * for someone who needn't be pushed (looking at the room now).
   */
  push?: { event: InboxEvent; url: string };
  /** For types with an email channel (`seat-open`, `chat-digest`). */
  email?: NotificationEmail;
}

/**
 * What happened on a channel: `sent` (at least one device, or the email),
 * `failed`, `skipped` (switched off here: PUSH_ENABLED, or no EMAIL),
 * `off` (the person turned it off), `none` (no device with push on, or no
 * email given), `duplicate` (this event went before).
 */
export type ChannelOutcome = DeliveryStatus | "off" | "none" | "duplicate";

export interface NotifyResult {
  /**
   * `new` when it wrote an inbox row, `duplicate` when every row was there
   * already (this event went before: no push either), `none` without rows.
   */
  inbox: "new" | "duplicate" | "none";
  push: ChannelOutcome;
  email: ChannelOutcome;
}

export interface NotifyOptions {
  now: Date;
  /** Test mode (a request's `isTestMode`); crons read AUTH_TEST_MODE. */
  testMode?: boolean;
  fetch?: typeof fetch;
}

const cronTestMode = (env: NotifyEnv) => env.AUTH_TEST_MODE === "true";

/**
 * Sends `payload` to each device, prunes the ones the push service says are
 * gone, and counts failures on the rest. Returns each device's outcome.
 */
async function pushToDevices(
  env: NotifyEnv,
  config: Extract<PushConfig, { enabled: true }>,
  devices: readonly PushSubscriptionRow[],
  type: PushType,
  payload: (device: PushSubscriptionRow) => Omit<PushPayload, "v" | "type">,
  options: NotifyOptions,
): Promise<{ sent: number; statuses: string }> {
  const { ttl, urgency } = PUSH_DELIVERY[type];
  const outcomes = await Promise.all(
    devices.map((device) =>
      sendPush(
        config,
        device,
        { v: 1, type, ...payload(device) },
        {
          ttl,
          urgency,
          now: options.now,
          ...(options.fetch ? { fetch: options.fetch } : {}),
        },
      ),
    ),
  );
  await env.DB.batch(
    devices.flatMap((device, i) =>
      recordSend(
        env.DB,
        device.id,
        outcomes[i]?.effect ?? "failure",
        options.now,
      ),
    ),
  );
  return {
    sent: outcomes.filter((o) => o.effect === "success").length,
    statuses: outcomes.map((o) => o.status ?? "error").join(","),
  };
}

/**
 * The push for a group, as it stands once this event is in: the group's
 * words and count, the badge, whether to buzz again, and the row a click
 * reads (V2 §6.7).
 */
async function groupedPush(
  env: NotifyEnv,
  userId: string,
  type: InboxType,
  push: NonNullable<Notification["push"]>,
  groupKey: string,
  fresh: readonly string[],
  now: Date,
): Promise<Omit<PushPayload, "v" | "type">> {
  const [group, badge] = await Promise.all([
    groupState(env.DB, userId, groupKey, fresh),
    unreadCount(env.DB, userId),
  ]);
  const words = groupWords(push.event, group);
  const event = group.events[0] ?? {
    actorId: null,
    createdAt: now.toISOString(),
  };
  return {
    ...words,
    url: push.url,
    tag: groupKey,
    count: Math.max(1, group.count),
    badge,
    renotify: shouldRenotify(type, event, group.others),
    ...(fresh[0] ? { id: fresh[0] } : {}),
  };
}

async function notifyByPush(
  env: NotifyEnv,
  userId: string,
  notification: Notification,
  fresh: readonly string[],
  options: NotifyOptions,
): Promise<ChannelOutcome> {
  const { type, push } = notification;
  const groupKey = notification.inbox?.[0]?.groupKey;
  // The digest is email only (channelOn never lets it here), and a push
  // stands for a group of inbox rows.
  if (type === "chat-digest" || !push || groupKey === undefined) return "none";
  const devices = await subscriptionsOf(env.DB, userId);
  if (devices.length === 0) return "none";
  const config = pushConfig(env, options.testMode ?? cronTestMode(env));
  const claim = {
    userId,
    type: notification.type,
    channel: "push" as const,
    dedupeKey: deliveryKey(notification.key, "push"),
    now: options.now,
  };
  if (!config.enabled) {
    const id = await claimDelivery(env.DB, { ...claim, status: "skipped" });
    return id === null ? "duplicate" : "skipped";
  }
  const id = await claimDelivery(env.DB, { ...claim, status: "failed" });
  if (id === null) return "duplicate";
  const payload = await groupedPush(
    env,
    userId,
    type,
    push,
    groupKey,
    fresh,
    options.now,
  );
  const { sent, statuses } = await pushToDevices(
    env,
    config,
    devices,
    type,
    () => payload,
    options,
  );
  const status = sent > 0 ? "sent" : "failed";
  await finishDelivery(env.DB, id, status, statuses.slice(0, 200));
  return status;
}

async function notifyByEmail(
  env: NotifyEnv,
  userId: string,
  notification: Notification,
  options: NotifyOptions,
): Promise<ChannelOutcome> {
  const { email } = notification;
  if (!email) return "none";
  const claim = {
    userId,
    type: notification.type,
    channel: "email" as const,
    dedupeKey: deliveryKey(notification.key, "email"),
    now: options.now,
  };
  if (!env.EMAIL) {
    const id = await claimDelivery(env.DB, { ...claim, status: "skipped" });
    return id === null ? "duplicate" : "skipped";
  }
  const id = await claimDelivery(env.DB, { ...claim, status: "failed" });
  if (id === null) return "duplicate";
  try {
    const result = await env.EMAIL.send({
      to: email.to,
      from: ALERTS_FROM,
      subject: `${env.EMAIL_SUBJECT_PREFIX ?? ""}${email.subject}`,
      text: email.text,
      html: email.html,
      headers: email.headers,
    });
    await finishDelivery(env.DB, id, "sent", result.messageId);
    return "sent";
  } catch (error) {
    console.warn({
      email: "send failed",
      kind: notification.type,
      code: String((error as { code?: unknown }).code ?? ""),
    });
    await finishDelivery(env.DB, id, "failed", null);
    return "failed";
  }
}

/**
 * Notifies one person of one event: its inbox rows always, then every
 * channel their settings allow. Callers keep their own rules (seat
 * watches' cooldown and daily cap, chat's muted rooms); this keeps the
 * inbox, the settings, the devices and the dedupe.
 */
export async function notify(
  env: NotifyEnv,
  userId: string,
  notification: Notification,
  options: NotifyOptions,
): Promise<NotifyResult> {
  const { type } = notification;
  const rows = notification.inbox ?? [];
  const fresh =
    type === "chat-digest"
      ? []
      : await writeInboxRows(env.DB, userId, type, rows, options.now);
  const inbox =
    rows.length === 0 ? "none" : fresh.length > 0 ? "new" : "duplicate";
  const settings = await readSettings(env.DB, userId);
  const want = (channel: "push" | "email") =>
    type === "admin-urgent"
      ? channel === "push"
      : channelOn(settings, type, channel);
  const [push, email] = await Promise.all([
    inbox === "duplicate"
      ? Promise.resolve<ChannelOutcome>("duplicate")
      : want("push")
        ? notifyByPush(env, userId, notification, fresh, options)
        : Promise.resolve<ChannelOutcome>(notification.push ? "off" : "none"),
    want("email")
      ? notifyByEmail(env, userId, notification, options)
      : Promise.resolve<ChannelOutcome>(notification.email ? "off" : "none"),
  ]);
  return { inbox, push, email };
}

/**
 * "Send me a test" (Settings): a push to each of this person's devices, now.
 * Not a notification type, so no settings and no delivery row; the route's
 * rate limit is the cap.
 */
export async function sendTestPush(
  env: NotifyEnv,
  userId: string,
  options: NotifyOptions,
): Promise<PushTestResult> {
  const config = pushConfig(env, options.testMode ?? cronTestMode(env));
  if (!config.enabled) return { status: "off" };
  const devices = await subscriptionsOf(env.DB, userId);
  if (devices.length === 0) return { status: "no-devices" };
  const { sent } = await pushToDevices(
    env,
    config,
    devices,
    "test",
    (device) => ({
      title: "Notifications are on",
      body: device.user_agent_label
        ? `This is how Terpsicle reaches you on ${device.user_agent_label}.`
        : "This is how Terpsicle reaches you on this device.",
      url: "/settings/notifications",
      tag: "test",
    }),
    options,
  );
  return sent > 0 ? { status: "sent", devices: sent } : { status: "failed" };
}
