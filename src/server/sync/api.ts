// Plan sync's JSON routes (docs/V2.md §5.3), registered in
// src/server/api/router.ts with `auth: "user"`:
//
//   sync/push   saves docs, each with a rev compare-and-swap
//   sync/pull   one page of docs saved since a cursor
import type {
  SyncPullInput,
  SyncPullResult,
  SyncPushInput,
  SyncPushResult,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { pullDocs, pushDocs } from "./store";

export interface SyncEnv {
  DB: D1Database;
}

export async function push(
  env: SyncEnv,
  input: SyncPushInput,
  ctx: IdentityRouteContext,
): Promise<SyncPushResult | Response> {
  // The router guarantees a session for `auth: "user"` routes.
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  return { results: await pushDocs(env.DB, user.id, input.docs, ctx.now) };
}

export async function pull(
  env: SyncEnv,
  input: SyncPullInput,
  ctx: IdentityRouteContext,
): Promise<SyncPullResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  return pullDocs(env.DB, user.id, input.since);
}
