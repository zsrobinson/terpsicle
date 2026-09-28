// Feedback's JSON routes (docs/FEEDBACK.md), composed into
// src/server/api/router.ts. Anyone can send it; who sent it is kept only
// when they ask for a reply.
import {
  FEEDBACK_MAX_REQUEST_BYTES,
  FeedbackDeleteInputSchema,
  FeedbackGroupInputSchema,
  FeedbackListInputSchema,
  FeedbackPinInputSchema,
  FeedbackPinsInputSchema,
  FeedbackSendInputSchema,
  FeedbackUndoInputSchema,
  FeedbackUpdateInputSchema,
} from "~/core/schema/feedback";
import { route } from "../api/route";
import {
  adminDeleteFeedback,
  adminListFeedback,
  adminUpdateFeedback,
  listPins,
  pinFeedback,
  sendFeedback,
  undoFeedback,
} from "./api";
import { groupOpenFeedback } from "./group";

export const FEEDBACK_ROUTES = {
  "feedback/send": route({
    input: FeedbackSendInputSchema,
    perIpPerHour: 12,
    perUserPerHour: 20,
    maxBytes: FEEDBACK_MAX_REQUEST_BYTES,
    auth: "optional",
    handle: (env, input, ctx) => sendFeedback(env, input, ctx),
  }),
  "feedback/undo": route({
    input: FeedbackUndoInputSchema,
    perIpPerHour: 30,
    auth: "optional",
    handle: (env, input, ctx) => undoFeedback(env, input, ctx),
  }),
  "feedback/pin": route({
    input: FeedbackPinInputSchema,
    perIpPerHour: 600,
    maxBytes: FEEDBACK_MAX_REQUEST_BYTES,
    auth: "admin",
    handle: (env, input, ctx) => pinFeedback(env, input, ctx),
  }),
  "feedback/pins": route({
    input: FeedbackPinsInputSchema,
    perIpPerHour: 2_000,
    auth: "admin",
    handle: (env, input) => listPins(env, input),
  }),
  "admin/feedback/list": route({
    input: FeedbackListInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input) => adminListFeedback(env, input),
  }),
  "admin/feedback/update": route({
    input: FeedbackUpdateInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) => adminUpdateFeedback(env, input, ctx),
  }),
  "admin/feedback/delete": route({
    input: FeedbackDeleteInputSchema,
    perIpPerHour: 600,
    auth: "admin",
    handle: (env, input, ctx) => adminDeleteFeedback(env, input, ctx),
  }),
  "admin/feedback/group": route({
    input: FeedbackGroupInputSchema,
    perIpPerHour: 60,
    auth: "admin",
    handle: (env, _input, ctx) => groupOpenFeedback(env, ctx.now),
  }),
} as const;
