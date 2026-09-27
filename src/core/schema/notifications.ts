import { z } from "zod";
import { IsoDateTimeSchema } from "./primitives";

// Notifications (docs/V2.md §6, V3.md §4): the settings each person keeps,
// the push subscriptions (one per device), and their routes, all
// `auth: "user"`. D1: migrations/0006_notifications.sql.

/** The kinds of notification a person can turn on or off (V2 §6.1, V3 §4). */
export const NotificationTypeSchema = z.enum([
  "seat-open",
  "chat-mention",
  "chat-reply",
  "chat-digest",
  "todo-due",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/** Everything we send, for `notification_deliveries.type` (`admin-urgent` is the owner's). */
export const DeliveryTypeSchema = z.enum([
  ...NotificationTypeSchema.options,
  "admin-urgent",
]);
export type DeliveryType = z.infer<typeof DeliveryTypeSchema>;

export const ChannelSchema = z.enum(["push", "email"]);
export type Channel = z.infer<typeof ChannelSchema>;

/**
 * `notification_settings.settings` and the settings routes. A field added
 * later gets a `.default`, so rows saved before it still read (V3 §4:
 * "Due tomorrow" is off until ELMS is connected).
 */
export const NotificationSettingsSchema = z.object({
  v: z.literal(1),
  seatOpen: z.object({ push: z.boolean(), email: z.boolean() }),
  chatMention: z.object({ push: z.boolean() }),
  chatReply: z.object({ push: z.boolean() }),
  chatDigest: z.object({ email: z.boolean() }),
  todoDue: z.object({ push: z.boolean() }).default({ push: false }),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  v: 1,
  seatOpen: { push: true, email: true },
  chatMention: { push: true },
  chatReply: { push: true },
  chatDigest: { email: false },
  todoDue: { push: false },
};

/** A subscription's public key: a base64url P-256 point (65 bytes, 87 characters). */
const P256dhSchema = z.string().regex(/^B[A-Za-z0-9_-]{86}$/);
/** Its auth secret: 16 bytes, base64url (22 characters). */
const AuthSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

/** A push endpoint URL as the browser gives it; which hosts we accept is `isPushEndpoint`. */
export const PushEndpointSchema = z.string().min(1).max(2048);

/** "iPhone · Safari" (`deviceLabel` in ~/core/pwa). */
export const DeviceLabelSchema = z.string().trim().min(1).max(60);

// ---------- POST /api/push/subscribe, push/unsubscribe ----------

/** What `PushSubscription.toJSON()` gives, plus the device's label. */
export const PushSubscribeInputSchema = z.strictObject({
  endpoint: PushEndpointSchema,
  keys: z.object({ p256dh: P256dhSchema, auth: AuthSecretSchema }),
  label: DeviceLabelSchema.nullish(),
});
export type PushSubscribeInput = z.infer<typeof PushSubscribeInputSchema>;

export const PushSubscribeResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok") }),
  /** Push is switched off here (PUSH_ENABLED). */
  z.object({ status: z.literal("off") }),
  /** Not a push service we send to. */
  z.object({ status: z.literal("unsupported") }),
]);
export type PushSubscribeResult = z.infer<typeof PushSubscribeResultSchema>;

export const PushUnsubscribeInputSchema = z.strictObject({
  endpoint: PushEndpointSchema,
});
export const OkResultSchema = z.object({ status: z.literal("ok") });

// ---------- POST /api/push/devices, push/remove ----------

export const PushDevicesInputSchema = z.strictObject({
  /** This device's endpoint, if it has one, to mark it in the list. */
  endpoint: PushEndpointSchema.optional(),
});

/** A device with push on, as the settings page lists it. The endpoint stays on the server. */
export const PushDeviceSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  lastSuccessAt: IsoDateTimeSchema.nullable(),
  /** The device asking. */
  current: z.boolean(),
});
export type PushDevice = z.infer<typeof PushDeviceSchema>;

export const PushDevicesResultSchema = z.object({
  devices: z.array(PushDeviceSchema),
});
export type PushDevicesResult = z.infer<typeof PushDevicesResultSchema>;

export const PushRemoveInputSchema = z.strictObject({
  id: z.string().min(1).max(64),
});

// ---------- POST /api/push/test ----------

export const PushTestInputSchema = z.strictObject({});

export const PushTestResultSchema = z.discriminatedUnion("status", [
  /** At least one device took it; `devices` did. */
  z.object({ status: z.literal("sent"), devices: z.number().int().min(1) }),
  z.object({ status: z.literal("no-devices") }),
  /** Every device's push service refused or failed. */
  z.object({ status: z.literal("failed") }),
  z.object({ status: z.literal("off") }),
]);
export type PushTestResult = z.infer<typeof PushTestResultSchema>;

// ---------- POST /api/notifications/settings, notifications/settings/set ----------

export const NotificationSettingsInputSchema = z.strictObject({});
export const NotificationSettingsSetInputSchema = z.strictObject({
  settings: NotificationSettingsSchema,
});
export const NotificationSettingsResultSchema = z.object({
  settings: NotificationSettingsSchema,
});
export type NotificationSettingsResult = z.infer<
  typeof NotificationSettingsResultSchema
>;

// ---------- D1 rows ----------

export const PushSubscriptionRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  user_agent_label: z.string().nullable(),
  created_at: IsoDateTimeSchema,
  last_success_at: IsoDateTimeSchema.nullable(),
  failure_count: z.number().int(),
});
export type PushSubscriptionRow = z.infer<typeof PushSubscriptionRowSchema>;

export const DeliveryStatusSchema = z.enum(["sent", "failed", "skipped"]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
