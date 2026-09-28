// Moderation's JSON routes, composed into src/server/api/router.ts: reporting
// (V2.md §9.3) and the owner's queue (docs/MODERATION.md §6).
import {
  FeatureVarsSchema,
  type ModerationKind,
  QueueListInputSchema,
  ReportCreateInputSchema,
  ResolveInputSchema,
  UndoInputSchema,
} from "~/core/schema";
import { apiError } from "../api/http";
import { type ApiEnv, reviewsAllow, route } from "../api/route";
import { listQueue, resolveQueueItem, undoQueueItem } from "./admin";
import { createReport, reportTargets } from "./reports";

export const MODERATION_ROUTES = {
  // Shared by Reviews and Chat (V2.md §9.3): each surface follows its own
  // switch, and reporting works while it's read-only.
  "reports/create": route({
    input: ReportCreateInputSchema,
    perUserPerHour: 30,
    auth: "user",
    handle: async (env, input, ctx) =>
      reportsOpen(env, input.surface)
        ? createReport(env, input, ctx, reportTargets(env))
        : apiError("unavailable"),
  }),
  "admin/moderation/queue": route({
    input: QueueListInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input) => listQueue(env.DB, input),
  }),
  "admin/moderation/resolve": route({
    input: ResolveInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) =>
      resolveQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
        actors: ctx.authorActors,
      }),
  }),
  "admin/moderation/undo": route({
    input: UndoInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) =>
      undoQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
        actors: ctx.authorActors,
      }),
  }),
} as const;

/** Whether a surface takes reports now: its switch is at least "read". */
function reportsOpen(env: ApiEnv, surface: ModerationKind): boolean {
  return surface === "review"
    ? reviewsAllow(env, "read")
    : FeatureVarsSchema.parse(env).CHAT_ENABLED !== "off";
}
