// Notification settings and delivery rules (docs/V2.md §6, V3.md §4): which
// channels each type has, whether a person has one on, and how long a push
// service holds each kind of push.
import type { PushType } from "~/core/schema";
import type {
  Channel,
  NotificationSettings,
  NotificationType,
} from "~/core/schema/notifications";

type SettingsKey = Exclude<keyof NotificationSettings, "v">;

const SETTINGS_KEY: Record<NotificationType, SettingsKey> = {
  "seat-open": "seatOpen",
  "chat-mention": "chatMention",
  "chat-reply": "chatReply",
  "chat-digest": "chatDigest",
  "todo-due": "todoDue",
};

/** The channels each type has (V2 §6.1's table, plus V3's `todo-due`). */
export const NOTIFICATION_CHANNELS: Record<
  NotificationType,
  readonly Channel[]
> = {
  "seat-open": ["push", "email"],
  "chat-mention": ["push"],
  "chat-reply": ["push"],
  "chat-digest": ["email"],
  "todo-due": ["push"],
};

/** Whether this person wants `type` by `channel`; false for a channel the type doesn't have. */
export function channelOn(
  settings: NotificationSettings,
  type: NotificationType,
  channel: Channel,
): boolean {
  const entry: Partial<Record<Channel, boolean>> = settings[SETTINGS_KEY[type]];
  return entry[channel] === true;
}

/** `settings` with one channel of one type turned on or off (a channel the type lacks is ignored). */
export function withChannel(
  settings: NotificationSettings,
  type: NotificationType,
  channel: Channel,
  on: boolean,
): NotificationSettings {
  if (!NOTIFICATION_CHANNELS[type].includes(channel)) return settings;
  const key = SETTINGS_KEY[type];
  return { ...settings, [key]: { ...settings[key], [channel]: on } };
}

/**
 * How long a push service keeps each kind for an offline device, and how
 * urgently it delivers (V2 §6.4, V3 §4). A seat is gone in an hour; a test
 * is only worth seeing now.
 */
export const PUSH_DELIVERY: Record<
  PushType,
  { ttl: number; urgency: "normal" | "high" }
> = {
  "seat-open": { ttl: 3_600, urgency: "high" },
  "chat-mention": { ttl: 86_400, urgency: "normal" },
  "chat-reply": { ttl: 86_400, urgency: "normal" },
  "admin-urgent": { ttl: 86_400, urgency: "high" },
  "todo-due": { ttl: 21_600, urgency: "normal" },
  test: { ttl: 300, urgency: "high" },
};

/** One delivery's dedupe key: the event's key and the channel (`seat-open:…:push`). */
export function deliveryKey(eventKey: string, channel: Channel): string {
  return `${eventKey}:${channel}`;
}

export * from "./inbox";
