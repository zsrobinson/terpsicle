// Notifications' JSON routes (V2.md §6.3), composed into
// src/server/api/router.ts. Push devices' are in ../push/api-routes.ts.
import {
  NotificationSettingsInputSchema,
  NotificationSettingsSetInputSchema,
  NotificationsInboxInputSchema,
  NotificationsReadInputSchema,
  NotificationsUnreadInputSchema,
} from "~/core/schema/notifications";
import { route } from "../api/route";
import {
  getSettings as getNotificationSettings,
  inbox as notificationsInbox,
  readInbox as notificationsRead,
  unreadInbox as notificationsUnread,
  setSettings as setNotificationSettings,
} from "./api";

export const NOTIFICATIONS_ROUTES = {
  "notifications/settings": route({
    input: NotificationSettingsInputSchema,
    perUserPerHour: 300,
    auth: "user",
    handle: (env, _input, ctx) => getNotificationSettings(env, ctx),
  }),
  "notifications/settings/set": route({
    input: NotificationSettingsSetInputSchema,
    perUserPerHour: 120,
    auth: "user",
    handle: (env, input, ctx) => setNotificationSettings(env, input, ctx),
  }),
  // The inbox (V2.md §6.7). The bell opens it; reading the thing itself
  // (a course, Todo's day) and notification clicks read it; the bar polls
  // the count on focus and every two minutes while visible.
  "notifications/inbox": route({
    input: NotificationsInboxInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => notificationsInbox(env, input, ctx),
  }),
  "notifications/read": route({
    input: NotificationsReadInputSchema,
    perUserPerHour: 1_200,
    auth: "user",
    handle: (env, input, ctx) => notificationsRead(env, input, ctx),
  }),
  "notifications/unread": route({
    input: NotificationsUnreadInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, _input, ctx) => notificationsUnread(env, ctx),
  }),
} as const;
