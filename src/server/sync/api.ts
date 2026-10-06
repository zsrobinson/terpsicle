// Plan sync's JSON routes (docs/V2.md §5.3), registered in
// ./api-routes.ts with `auth: "user"`:
//
//   sync/push   saves docs, each with a rev compare-and-swap
//   sync/pull   one page of docs saved since a cursor
import type {
  SyncPullInput,
  SyncPullResult,
  SyncPushInput,
  SyncPushResult,
  UserDataKeyVars,
} from "~/core/schema";
import { FourYearDocSchema } from "~/core/schema/four-year";
import { captureServerEvent } from "../analytics";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { refreshChatMembers } from "../chat/store";
import {
  type AccountKeyBucket,
  userDataForRequest,
} from "../security/user-keys";
import { pullDocs, pushDocs } from "./store";

/** Bodies are sealed with each account's key (../security/user-keys.ts). */
export interface SyncEnv extends UserDataKeyVars, AccountKeyBucket {
  DB: D1Database;
  POSTHOG_TOKEN?: string;
  /** "true" lets four-year docs be saved (docs/V3.md §2.4, §8). */
  PLAN_ENABLED?: string;
}

export async function push(
  env: SyncEnv,
  input: SyncPushInput,
  ctx: IdentityRouteContext,
): Promise<SyncPushResult | Response> {
  // The router guarantees a session for `auth: "user"` routes.
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  // Until Terpsicle Plan ships, no four-year doc is stored, so a tab from
  // before it never pulls one. The whole push is refused, not the doc, so a
  // device can't take a half-saved push for a full one.
  const fourYearDocs = input.docs.filter((d) => d.kind === "four-year").length;
  if (fourYearDocs > 0 && env.PLAN_ENABLED !== "true")
    return apiError("unavailable");
  // The input schema checks only a four-year body's id (FourYearSyncBodySchema
  // keeps the full schema out of the shared barrel); the whole doc is checked
  // here, and like any invalid input nothing of the push is saved.
  const invalidFourYear = input.docs.some(
    (d) =>
      d.kind === "four-year" &&
      d.body !== null &&
      !FourYearDocSchema.safeParse(d.body).success,
  );
  if (invalidFourYear) return apiError("invalid-input");
  // One account key for the push and the membership it rewrites.
  const data = userDataForRequest(env, ctx.request);
  const results = await pushDocs(data, user.id, input.docs, ctx.now);
  // Chat rooms come from the stored plans (V2.md §8.2): what was saved moves
  // the person's chat_members.
  const saved = results.filter((r) => r.status === "ok");
  await refreshChatMembers(
    data,
    user.id,
    {
      planIds: saved.filter((r) => r.kind === "plan").map((r) => r.id),
      settings: saved.some((r) => r.kind === "settings"),
    },
    ctx.now,
  );
  ctx.waitUntil(
    captureServerEvent(
      env,
      "sync_push",
      {
        docs: results.length,
        fourYearDocs,
        conflicts: results.filter((r) => r.status === "conflict").length,
      },
      { now: ctx.now, ...(ctx.fetch ? { fetcher: ctx.fetch } : {}) },
    ),
  );
  return { results };
}

export async function pull(
  env: SyncEnv,
  input: SyncPullInput,
  ctx: IdentityRouteContext,
): Promise<SyncPullResult | Response> {
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  return pullDocs(userDataForRequest(env, ctx.request), user.id, input.since);
}
