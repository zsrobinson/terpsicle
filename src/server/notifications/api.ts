// Notifications' routes (V2.md §6.3), registered in src/server/api/router.ts,
// all `auth: "user"`:
//
//   push/subscribe               save this device's push subscription
//   push/unsubscribe             forget it (turning push off here)
//   push/devices                 the devices with push on
//   push/remove                  forget another device, by id
//   push/test                    "Send me a test"
//   notifications/settings       read the settings
//   notifications/settings/set   save them
import { isPushEndpoint } from "~/core/push";
import type {
  NotificationSettings,
  NotificationSettingsResult,
  PushDevicesResult,
  PushSubscribeInput,
  PushSubscribeResult,
  PushTestResult,
} from "~/core/schema/notifications";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { type AuthEnv, isTestMode } from "../auth/config";
import { pushConfig } from "../push/config";
import {
  deleteByEndpoint,
  deleteById,
  saveSubscription,
  subscriptionsOf,
} from "../push/store";
import { getFeed, resumePausedFeed } from "../todo/store";
import { type NotifyEnv, sendTestPush } from "./notify";
import { readSettings, writeSettings } from "./store";

export type NotificationsEnv = NotifyEnv & AuthEnv;

type Ctx = IdentityRouteContext & { fetch?: typeof fetch };

const testModeOf = (env: AuthEnv, ctx: Ctx) =>
  isTestMode(env, new URL(ctx.request.url));

/** The signed-in person (the router guarantees one for these routes). */
function userOf(ctx: Ctx): string | null {
  return ctx.session?.user.id ?? null;
}

export async function subscribe(
  env: NotificationsEnv,
  input: PushSubscribeInput,
  ctx: Ctx,
): Promise<PushSubscribeResult | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  const config = pushConfig(env, testModeOf(env, ctx));
  if (!config.enabled) return { status: "off" };
  if (!isPushEndpoint(input.endpoint, { allowLocal: config.allowLocal }))
    return { status: "unsupported" };
  await saveSubscription(env.DB, {
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    label: input.label ?? null,
    now: ctx.now,
  });
  return { status: "ok" };
}

export async function unsubscribe(
  env: NotificationsEnv,
  input: { endpoint: string },
  ctx: Ctx,
): Promise<{ status: "ok" } | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  await deleteByEndpoint(env.DB, userId, input.endpoint);
  return { status: "ok" };
}

export async function devices(
  env: NotificationsEnv,
  input: { endpoint?: string | undefined },
  ctx: Ctx,
): Promise<PushDevicesResult | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  const rows = await subscriptionsOf(env.DB, userId);
  return {
    devices: rows.map((row) => ({
      id: row.id,
      label: row.user_agent_label,
      createdAt: row.created_at,
      lastSuccessAt: row.last_success_at,
      current: input.endpoint !== undefined && row.endpoint === input.endpoint,
    })),
  };
}

export async function removeDevice(
  env: NotificationsEnv,
  input: { id: string },
  ctx: Ctx,
): Promise<{ status: "ok" } | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  await deleteById(env.DB, userId, input.id);
  return { status: "ok" };
}

export async function testPush(
  env: NotificationsEnv,
  ctx: Ctx,
): Promise<PushTestResult | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  return sendTestPush(env, userId, {
    now: ctx.now,
    testMode: testModeOf(env, ctx),
    ...(ctx.fetch ? { fetch: ctx.fetch } : {}),
  });
}

export async function getSettings(
  env: NotificationsEnv,
  ctx: Ctx,
): Promise<NotificationSettingsResult | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  const [settings, feed] = await Promise.all([
    readSettings(env.DB, userId),
    getFeed(env.DB, userId),
  ]);
  return { settings, todoConnected: feed !== null };
}

export async function setSettings(
  env: NotificationsEnv,
  input: { settings: NotificationSettings },
  ctx: Ctx,
): Promise<NotificationSettingsResult | Response> {
  const userId = userOf(ctx);
  if (!userId) return apiError("unauthorized");
  const before = await readSettings(env.DB, userId);
  await writeSettings(env.DB, userId, input.settings, ctx.now);
  if (input.settings.todoDue.push && !before.todoDue.push)
    await resumePausedFeed(env.DB, userId, ctx.now);
  return { settings: input.settings };
}
