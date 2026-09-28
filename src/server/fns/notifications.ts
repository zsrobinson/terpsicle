// Notifications' routes (docs/V2.md §6.3, §6.7), signed in only. Apart
// from ~/server/fns/api so pages that never show notifications don't carry
// these calls.
import type { z } from "zod";
import {
  NotificationSettingsInputSchema,
  NotificationSettingsResultSchema,
  NotificationSettingsSetInputSchema,
  NotificationsInboxInputSchema,
  NotificationsInboxResultSchema,
  NotificationsReadInputSchema,
  NotificationsUnreadInputSchema,
  NotificationsUnreadResultSchema,
  OkResultSchema,
  PushDevicesInputSchema,
  PushDevicesResultSchema,
  PushRemoveInputSchema,
  PushSubscribeInputSchema,
  PushSubscribeResultSchema,
  PushTestInputSchema,
  PushTestResultSchema,
  PushUnsubscribeInputSchema,
} from "~/core/schema/notifications";
import { type ApiOptions, call } from "./api";

export const notificationsApi = {
  settings: (options?: ApiOptions) =>
    call(
      "notifications/settings",
      NotificationSettingsInputSchema,
      NotificationSettingsResultSchema,
      {},
      options,
    ),
  setSettings: (
    input: z.input<typeof NotificationSettingsSetInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "notifications/settings/set",
      NotificationSettingsSetInputSchema,
      NotificationSettingsResultSchema,
      input,
      options,
    ),
  /** Saves this device's subscription (`PushSubscription.toJSON()` and a label). */
  subscribe: (
    input: z.input<typeof PushSubscribeInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "push/subscribe",
      PushSubscribeInputSchema,
      PushSubscribeResultSchema,
      input,
      options,
    ),
  unsubscribe: (
    input: z.input<typeof PushUnsubscribeInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "push/unsubscribe",
      PushUnsubscribeInputSchema,
      OkResultSchema,
      input,
      options,
    ),
  /** The devices with push on; pass this device's endpoint to mark it. */
  devices: (
    input: z.input<typeof PushDevicesInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "push/devices",
      PushDevicesInputSchema,
      PushDevicesResultSchema,
      input,
      options,
    ),
  remove: (
    input: z.input<typeof PushRemoveInputSchema>,
    options?: ApiOptions,
  ) =>
    call("push/remove", PushRemoveInputSchema, OkResultSchema, input, options),
  test: (options?: ApiOptions) =>
    call("push/test", PushTestInputSchema, PushTestResultSchema, {}, options),
  /** A page of the inbox, newest first (V2.md §6.7); pass the last page's `next` as `before`. */
  inbox: (
    input: z.input<typeof NotificationsInboxInputSchema> = {},
    options?: ApiOptions,
  ) =>
    call(
      "notifications/inbox",
      NotificationsInboxInputSchema,
      NotificationsInboxResultSchema,
      input,
      options,
    ),
  /** Marks items (by id), everything, a course's seat openings or a day's "Due tomorrow" read. */
  read: (
    input: z.input<typeof NotificationsReadInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "notifications/read",
      NotificationsReadInputSchema,
      NotificationsUnreadResultSchema,
      input,
      options,
    ),
  /** The unread count, cheap: for the bar's bell and the badge. */
  unread: (options?: ApiOptions) =>
    call(
      "notifications/unread",
      NotificationsUnreadInputSchema,
      NotificationsUnreadResultSchema,
      {},
      options,
    ),
};
