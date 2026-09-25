// The JSON API: POST /api/<name>, JSON in and out, both sides validated with
// the schemas in ~/core/schema (the browser side is ~/server/fns/api).
// Plain Worker routes rather than createServerFn: they run in the worker test
// pool against real D1/R2 bindings, see the raw request (CF-Connecting-IP for
// rate limits), and keep Worker-only types out of the app's TS program.
import type { z } from "zod";
import {
  ConfirmInputSchema,
  ManageInputSchema,
  ReviewSummaryInputSchema,
  StatusInputSchema,
  SubscribeInputSchema,
} from "~/core/schema";
import {
  type AlertsContext,
  type AlertsEnv,
  alertsEnabled,
  confirm,
  lookup,
  status,
  subscribe,
  unsubscribe,
} from "../alerts/service";
import { APEX_HOST } from "../apex";
import { hit, secondsLeft } from "../counters";
import { keyedHash } from "../crypto";
import { getReviewSummary, type SummaryEnv } from "../summaries/service";
import { apiError, clientIp, json, readInput } from "./http";

export const API_PREFIX = "/api/";

export type ApiEnv = AlertsEnv & SummaryEnv;

interface Route<S extends z.ZodType> {
  input: S;
  /** Requests per IP per hour. */
  perIpPerHour: number;
  /** Seat-alert routes answer "unavailable" while the flag is off. */
  alerts: boolean;
  handle: (
    env: ApiEnv,
    input: z.infer<S>,
    ctx: AlertsContext,
  ) => Promise<unknown>;
}

const route = <S extends z.ZodType>(r: Route<S>) => r;

const ROUTES = {
  "review-summary": route({
    input: ReviewSummaryInputSchema,
    perIpPerHour: 300,
    alerts: false,
    handle: (env, input, ctx) =>
      getReviewSummary(env, input, { now: ctx.now, waitUntil: ctx.waitUntil }),
  }),
  "alerts/subscribe": route({
    input: SubscribeInputSchema,
    perIpPerHour: 10,
    alerts: false, // Answers "unavailable" in its own result when off.
    handle: (env, input, ctx) => subscribe(env, input, ctx),
  }),
  "alerts/confirm": route({
    input: ConfirmInputSchema,
    perIpPerHour: 60,
    alerts: true,
    handle: (env, input, ctx) => confirm(env, input, ctx),
  }),
  "alerts/lookup": route({
    input: ManageInputSchema,
    perIpPerHour: 60,
    alerts: true,
    handle: (env, input) => lookup(env, input),
  }),
  "alerts/unsubscribe": route({
    input: ManageInputSchema,
    perIpPerHour: 60,
    alerts: true,
    handle: (env, input, ctx) => unsubscribe(env, input, ctx),
  }),
  "alerts/status": route({
    input: StatusInputSchema,
    perIpPerHour: 120,
    alerts: true,
    handle: (env, input) => status(env, input),
  }),
} as const;

/**
 * Where links in emails point. Only our own hosts: a forged Host header must
 * never put someone else's domain into a confirmation email.
 */
export function linkOrigin(url: URL): string {
  const host = url.hostname;
  const ours =
    host === APEX_HOST ||
    host.endsWith("-terpsicle.zsrobinson.workers.dev") ||
    host === "localhost" ||
    host === "127.0.0.1";
  return ours ? url.origin : `https://${APEX_HOST}`;
}

export async function handleApi(
  request: Request,
  env: ApiEnv,
  ctx: Pick<ExecutionContext, "waitUntil">,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.pathname.slice(API_PREFIX.length);
  const r: Route<z.ZodType> | undefined = Object.hasOwn(ROUTES, name)
    ? ROUTES[name as keyof typeof ROUTES]
    : undefined;
  if (!r) return apiError("not-found");
  if (request.method !== "POST") return apiError("method-not-allowed");
  // JSON only: a cross-site form can't send this type without a CORS
  // preflight, which we never grant.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return apiError("invalid-input");
  }
  if (r.alerts && !alertsEnabled(env)) return apiError("unavailable");

  const ipHash = await keyedHash(env.DATA, clientIp(request));
  const window = { seconds: 3_600 };
  if ((await hit(env.DB, `${name}:${ipHash}`, window, now)) > r.perIpPerHour) {
    const retryAfterSeconds = secondsLeft(window, now);
    return name === "alerts/subscribe"
      ? json({ status: "rate-limited", retryAfterSeconds })
      : apiError("rate-limited", retryAfterSeconds);
  }

  const input = await readInput(request, r.input);
  if (input === null) return apiError("invalid-input");
  const result = await r.handle(env, input, {
    now,
    origin: linkOrigin(url),
    waitUntil: (p) => ctx.waitUntil(p),
  });
  return json(result);
}
