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
import { captureServerEvent } from "../analytics";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { refreshChatMembers } from "../chat/store";
import { pullDocs, pushDocs } from "./store";

export interface SyncEnv {
  DB: D1Database;
  POSTHOG_TOKEN?: string;
}

export async function push(
  env: SyncEnv,
  input: SyncPushInput,
  ctx: IdentityRouteContext,
): Promise<SyncPushResult | Response> {
  // The router guarantees a session for `auth: "user"` routes.
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const results = await pushDocs(env.DB, user.id, input.docs, ctx.now);
  // Chat rooms come from the stored plans (V2.md §8.2): what was saved moves
  // the person's chat_members.
  const saved = results.filter((r) => r.status === "ok");
  await refreshChatMembers(env.DB, user.id, {
    planIds: saved.filter((r) => r.kind === "plan").map((r) => r.id),
    settings: saved.some((r) => r.kind === "settings"),
  });
  ctx.waitUntil(
    captureServerEvent(
      env,
      "sync_push",
      {
        docs: results.length,
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
  return pullDocs(env.DB, user.id, input.since);
}
