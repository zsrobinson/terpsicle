// Identity's JSON routes (docs/AUTH.md), composed into
// src/server/api/router.ts. The sign-in navigations are GETs, routed there.
import {
  AccountDeleteInputSchema,
  MeInputSchema,
  SignOutInputSchema,
  TestSignInInputSchema,
} from "~/core/schema";
import { alertsEnabled } from "../alerts/service";
import { type ApiEnv, route } from "../api/route";
import { pushConfig } from "../push/config";
import { todoAvailable } from "../todo/config";
import { deleteAccount, me, signOut, testSignIn } from "./api";
import { isTestMode } from "./config";

export const AUTH_ROUTES = {
  me: route({
    input: MeInputSchema,
    perIpPerHour: 600,
    handle: (env, _input, ctx) =>
      me(env, ctx, {
        seatAlerts: alertsEnabled(env),
        todo: todoAvailable(env, isTestMode(env, new URL(ctx.request.url))),
        pushPublicKey: pushPublicKey(env, ctx.request),
      }),
  }),
  "auth/sign-out": route({
    input: SignOutInputSchema,
    perIpPerHour: 30,
    handle: (env, input, ctx) => signOut(env, input, ctx),
  }),
  "account/delete": route({
    input: AccountDeleteInputSchema,
    perIpPerHour: 30,
    perUserPerHour: 10,
    auth: "user",
    handle: (env, _input, ctx) => deleteAccount(env, ctx),
  }),
  "auth/test-sign-in": route({
    input: TestSignInInputSchema,
    perIpPerHour: 60,
    handle: (env, input, ctx) => testSignIn(env, input, ctx),
  }),
} as const;

/** The VAPID public key the app subscribes with, while push works here. */
function pushPublicKey(env: ApiEnv, request: Request): string | null {
  const config = pushConfig(env, isTestMode(env, new URL(request.url)));
  return config.enabled ? config.publicKey : null;
}
