// The JSON API: POST /api/<name>, JSON in and out, both sides validated with
// the schemas in ~/core/schema (the browser side is ~/server/fns/api).
// Plain Worker routes rather than createServerFn: they run in the worker test
// pool against real D1/R2 bindings, see the raw request (CF-Connecting-IP for
// rate limits), and keep Worker-only types out of the app's TS program.
//
// Each area writes its routes in its own table, src/server/<area>/api-routes.ts,
// with `route({...})` from ./route.ts; this file composes them and runs them.
import type { z } from "zod";
import { ADMIN_ROUTES } from "../admin/api-routes";
import { ALERTS_ROUTES } from "../alerts/api-routes";
import {
  alertsEnabled,
  handleOneClick,
  ONE_CLICK_ROUTE,
} from "../alerts/service";
import { APEX_HOST } from "../apex";
import { AUTH_ROUTES } from "../auth/api-routes";
import { handleFlow, isFlowRoute } from "../auth/flow";
import { isSameOrigin } from "../auth/guard";
import { getSession } from "../auth/session";
import { CALENDAR_ROUTES } from "../calendar/api-routes";
import { CHAT_ROUTES } from "../chat/api-routes";
import { hit, secondsLeft } from "../counters";
import { keyedHash } from "../crypto";
import { FEEDBACK_ROUTES } from "../feedback/api-routes";
import { MODERATION_ROUTES } from "../moderation/api-routes";
import {
  type AuthorActors,
  authorActors,
  type ModerationHandlers,
  moderationHandlers,
} from "../moderation/handlers";
import { NOTIFICATIONS_ROUTES } from "../notifications/api-routes";
import { EMAIL_OFF_ROUTE, handleEmailOff } from "../notifications/email-off";
import { PUSH_ROUTES } from "../push/api-routes";
import { REVIEWS_ROUTES } from "../reviews/api-routes";
import { SUMMARY_ROUTES } from "../summaries/api-routes";
import { SYNC_ROUTES } from "../sync/api-routes";
import { TODO_ROUTES } from "../todo/api-routes";
import {
  apiError,
  clientIp,
  DEFAULT_MAX_INPUT_BYTES,
  json,
  readInput,
} from "./http";
import {
  type ApiEnv,
  type Route,
  type RouteContext,
  reviewsAllow,
} from "./route";

export type { ApiEnv, RouteContext } from "./route";

export const API_PREFIX = "/api/";

export interface ApiOptions {
  /** Outbound fetch for Google; tests mock it. */
  fetch?: typeof fetch;
  /** Overrides moderationHandlers(env), for tests. */
  moderationHandlers?: ModerationHandlers;
  /** Overrides authorActors(env), for tests. */
  authorActors?: AuthorActors;
}

/**
 * Every area's table, by area. A name belongs to one area: routes.test.ts
 * holds them apart, since spreading them into ROUTES would let a later
 * table quietly replace an earlier one's route.
 */
export const ROUTE_TABLES = {
  summaries: SUMMARY_ROUTES,
  alerts: ALERTS_ROUTES,
  auth: AUTH_ROUTES,
  sync: SYNC_ROUTES,
  chat: CHAT_ROUTES,
  reviews: REVIEWS_ROUTES,
  moderation: MODERATION_ROUTES,
  todo: TODO_ROUTES,
  calendar: CALENDAR_ROUTES,
  push: PUSH_ROUTES,
  notifications: NOTIFICATIONS_ROUTES,
  feedback: FEEDBACK_ROUTES,
  admin: ADMIN_ROUTES,
} as const;

/** Every route, by the name after /api/. */
export const ROUTES = {
  ...SUMMARY_ROUTES,
  ...ALERTS_ROUTES,
  ...AUTH_ROUTES,
  ...SYNC_ROUTES,
  ...CHAT_ROUTES,
  ...REVIEWS_ROUTES,
  ...MODERATION_ROUTES,
  ...TODO_ROUTES,
  ...CALENDAR_ROUTES,
  ...PUSH_ROUTES,
  ...NOTIFICATIONS_ROUTES,
  ...FEEDBACK_ROUTES,
  ...ADMIN_ROUTES,
} as const;

/** A person's counter for one route (`counters.name`, pruned like the rest). */
export function userLimitKey(userId: string, route: string): string {
  return `user:${userId}:${route}`;
}

/**
 * Where links in emails point. Only our own hosts: a forged Host header must
 * never put someone else's domain into an email link.
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
  options: ApiOptions = {},
): Promise<Response> {
  const url = new URL(request.url);
  const name = url.pathname.slice(API_PREFIX.length);
  // The sign-in navigations: GETs that redirect, not JSON POSTs.
  if (isFlowRoute(name))
    return handleFlow(request, env, {
      now,
      waitUntil: (p) => ctx.waitUntil(p),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  const r: Route<z.ZodType> | undefined = Object.hasOwn(ROUTES, name)
    ? ROUTES[name as keyof typeof ROUTES]
    : undefined;
  // A mail provider's one-click unsubscribe: a form POST, not JSON.
  if (name === ONE_CLICK_ROUTE)
    return handleOneClick(request, env, {
      now,
      origin: linkOrigin(url),
      waitUntil: (p) => ctx.waitUntil(p),
      ipHash: () => keyedHash(env.DATA, clientIp(request)),
    });
  if (name === EMAIL_OFF_ROUTE)
    return handleEmailOff(request, env, {
      now,
      origin: linkOrigin(url),
      ipHash: () => keyedHash(env.DATA, clientIp(request)),
    });
  if (!r) return apiError("not-found");
  if (request.method !== "POST") return apiError("method-not-allowed");
  // JSON only: a cross-site form can't send this type without a CORS
  // preflight, which we never grant.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return apiError("invalid-input");
  }
  if (r.whenOff !== undefined && !alertsEnabled(env)) return json(r.whenOff);
  if (r.reviews && !reviewsAllow(env, r.reviews))
    return apiError("unavailable");

  const window = { seconds: 3_600 };
  const limited = () => {
    const retryAfterSeconds = secondsLeft(window, now);
    return apiError("rate-limited", retryAfterSeconds);
  };
  if (r.perIpPerHour !== undefined) {
    const ipHash = await keyedHash(env.DATA, clientIp(request));
    if ((await hit(env.DB, `${name}:${ipHash}`, window, now)) > r.perIpPerHour)
      return limited();
  }

  let session: RouteContext["session"] = null;
  if (r.auth === "user" || r.auth === "admin") {
    if (!isSameOrigin(request)) return apiError("forbidden");
    session = await getSession(request, env, now, { refresh: true });
    if (!session) return apiError("unauthorized");
  } else if (r.auth === "optional") {
    if (!isSameOrigin(request)) return apiError("forbidden");
    session = await getSession(request, env, now, { refresh: true });
  }
  // From here on a refreshed session's new cookie goes out with every
  // answer, errors included: the old token stops working a minute later.
  const reply = (response: Response): Response => {
    if (session?.setCookie)
      response.headers.append("Set-Cookie", session.setCookie);
    return response;
  };
  if (session) {
    if (r.auth === "admin" && !session.user.isAdmin)
      return reply(apiError("forbidden"));
    if (
      r.perUserPerHour !== undefined &&
      (await hit(env.DB, userLimitKey(session.user.id, name), window, now)) >
        r.perUserPerHour
    )
      return reply(limited());
  }

  const input = await readInput(
    request,
    r.input,
    r.maxBytes ?? DEFAULT_MAX_INPUT_BYTES,
  );
  if (input === null) return reply(apiError("invalid-input"));

  const result = await r.handle(env, input, {
    now,
    origin: linkOrigin(url),
    waitUntil: (p) => ctx.waitUntil(p),
    request,
    session,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    moderationHandlers: options.moderationHandlers ?? moderationHandlers(env),
    authorActors: options.authorActors ?? authorActors(env),
  });
  return reply(result instanceof Response ? result : json(result));
}
