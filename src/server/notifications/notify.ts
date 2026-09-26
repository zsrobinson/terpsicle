// The one way anything notifies a person (V2.md §6): seat watches, chat
// mentions and replies, Todo's "Due tomorrow". `notify` reads their
// settings, sends a web push to each of their devices and, for types with
// email, an email, and records each channel in notification_deliveries
// under the event's dedupe key, so a retried job never sends twice.
import { channelOn, deliveryKey, PUSH_DELIVERY } from "~/core/notifications";
import type { PushPayload, PushType } from "~/core/schema";
import type {
  DeliveryStatus,
  NotificationType,
  PushSubscriptionRow,
  PushTestResult,
} from "~/core/schema/notifications";
import { ALERTS_FROM } from "../alerts/email";
import { type PushConfig, type PushEnv, pushConfig } from "../push/config";
import { sendPush } from "../push/send";
import { recordSend, subscriptionsOf } from "../push/store";
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
  type: NotificationType;
  /**
   * Unique per event, the same on every retry of it:
   * `seat-open:<userId>:<term>:<section>:<asOf>`. Each channel adds its
   * name (`…:push`, `…:email`).
   */
  key: string;
  /** What the push shows (`PushPayloadSchema` without `v` and `type`). */
  push: Omit<PushPayload, "v" | "type">;
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

async function notifyByPush(
  env: NotifyEnv,
  userId: string,
  notification: Notification,
  options: NotifyOptions,
): Promise<ChannelOutcome> {
  const { type } = notification;
  // The digest is email only (channelOn never lets it here).
  if (type === "chat-digest") return "none";
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
  const { sent, statuses } = await pushToDevices(
    env,
    config,
    devices,
    type,
    () => notification.push,
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
 * Notifies one person of one event, on every channel their settings allow.
 * Callers keep their own rules (seat watches' cooldown and daily cap, chat's
 * muted rooms); this keeps the settings, the devices and the dedupe.
 */
export async function notify(
  env: NotifyEnv,
  userId: string,
  notification: Notification,
  options: NotifyOptions,
): Promise<NotifyResult> {
  const settings = await readSettings(env.DB, userId);
  const want = (channel: "push" | "email") =>
    channelOn(settings, notification.type, channel);
  const [push, email] = await Promise.all([
    want("push")
      ? notifyByPush(env, userId, notification, options)
      : Promise.resolve<ChannelOutcome>("off"),
    want("email")
      ? notifyByEmail(env, userId, notification, options)
      : Promise.resolve<ChannelOutcome>(notification.email ? "off" : "none"),
  ]);
  return { push, email };
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
      url: "/settings#notifications",
      tag: "test",
    }),
    options,
  );
  return sent > 0 ? { status: "sent", devices: sent } : { status: "failed" };
}
