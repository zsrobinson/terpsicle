// The admin panel's JSON routes (V2 §10), composed into
// src/server/api/router.ts. Feedback's and moderation's admin routes live
// with their areas.
import {
  AdminChatRemoveInputSchema,
  AdminGradeSaveInputSchema,
  AdminGradesInputSchema,
  AdminHealthInputSchema,
  AdminSamplesInputSchema,
  DecisionListInputSchema,
} from "~/core/schema/admin";
import { route } from "../api/route";
import { removeChatMessage } from "./chat-remove";
import { listDecisions } from "./decisions";
import { adminGrades, saveGradeRequest } from "./grades";
import { adminHealth } from "./health";
import { addSamples } from "./samples";

export const ADMIN_ROUTES = {
  "admin/chat/remove": route({
    input: AdminChatRemoveInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) =>
      removeChatMessage(env, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
        actors: ctx.authorActors,
      }),
  }),
  "admin/decisions": route({
    input: DecisionListInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) => listDecisions(env.DB, input, ctx.now),
  }),
  "admin/health": route({
    input: AdminHealthInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, _input, ctx) => adminHealth(env, ctx.now),
  }),
  // The Grade data page: semesters to ask the university for.
  "admin/grades": route({
    input: AdminGradesInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, _input, ctx) => adminGrades(env, ctx.now),
  }),
  "admin/grades/save": route({
    input: AdminGradeSaveInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) => saveGradeRequest(env, input, ctx.now),
  }),
  "admin/samples": route({
    input: AdminSamplesInputSchema,
    perIpPerHour: 60,
    auth: "admin",
    handle: (env, _input, ctx) => addSamples(env, ctx),
  }),
} as const;
