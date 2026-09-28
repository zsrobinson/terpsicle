// Push devices' JSON routes (V2.md §6.3), composed into
// src/server/api/router.ts. Their handlers live with the rest of
// notifications (../notifications/api.ts).
import {
  PushDevicesInputSchema,
  PushRemoveInputSchema,
  PushSubscribeInputSchema,
  PushTestInputSchema,
  PushUnsubscribeInputSchema,
} from "~/core/schema/notifications";
import { route } from "../api/route";
import {
  devices as pushDevices,
  subscribe as pushSubscribe,
  unsubscribe as pushUnsubscribe,
  removeDevice as removePushDevice,
  testPush,
} from "../notifications/api";

export const PUSH_ROUTES = {
  "push/subscribe": route({
    input: PushSubscribeInputSchema,
    perUserPerHour: 60,
    auth: "user",
    handle: (env, input, ctx) => pushSubscribe(env, input, ctx),
  }),
  "push/unsubscribe": route({
    input: PushUnsubscribeInputSchema,
    perUserPerHour: 60,
    auth: "user",
    handle: (env, input, ctx) => pushUnsubscribe(env, input, ctx),
  }),
  "push/devices": route({
    input: PushDevicesInputSchema,
    perUserPerHour: 300,
    auth: "user",
    handle: (env, input, ctx) => pushDevices(env, input, ctx),
  }),
  "push/remove": route({
    input: PushRemoveInputSchema,
    perUserPerHour: 60,
    auth: "user",
    handle: (env, input, ctx) => removePushDevice(env, input, ctx),
  }),
  // Each one reaches every device the person has; a handful is plenty.
  "push/test": route({
    input: PushTestInputSchema,
    perUserPerHour: 10,
    auth: "user",
    handle: (env, _input, ctx) => testPush(env, ctx),
  }),
} as const;
