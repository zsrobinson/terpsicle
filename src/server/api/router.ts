// The JSON API: POST /api/<name>, JSON in and out, both sides validated with
// the schemas in ~/core/schema (the browser side is ~/server/fns/api).
// Plain Worker routes rather than createServerFn: they run in the worker test
// pool against real D1/R2 bindings, see the raw request (CF-Connecting-IP for
// rate limits), and keep Worker-only types out of the app's TS program.
import type { z } from "zod";
import {
  AccountDeleteInputSchema,
  ConfirmInputSchema,
  ManageInputSchema,
  MeInputSchema,
  QueueListInputSchema,
  ResolveInputSchema,
  ReviewSummaryInputSchema,
  SignOutInputSchema,
  StatusInputSchema,
  type StatusResult,
  SubscribeInputSchema,
  type SubscribeResult,
  SYNC_MAX_PUSH_REQUEST_BYTES,
  SyncPullInputSchema,
  SyncPushInputSchema,
  TestSignInInputSchema,
  TODO_IMPORT_MAX_BYTES,
  TodoConnectInputSchema,
  TodoDisconnectInputSchema,
  TodoDoneInputSchema,
  TodoImportFileInputSchema,
  TodoListInputSchema,
  TodoRefreshInputSchema,
  UndoInputSchema,
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
import {
  deleteAccount,
  type IdentityRouteContext,
  me,
  signOut,
  testSignIn,
} from "../auth/api";
import { type AuthEnv, isTestMode } from "../auth/config";
import { handleFlow, isFlowRoute } from "../auth/flow";
import { isSameOrigin } from "../auth/guard";
import { getSession } from "../auth/session";
import { hit, secondsLeft } from "../counters";
import { keyedHash } from "../crypto";
import {
  listQueue,
  resolveQueueItem,
  undoQueueItem,
} from "../moderation/admin";
import {
  MODERATION_HANDLERS,
  type ModerationHandlers,
} from "../moderation/handlers";
import type { ModerationEnv } from "../moderation/service";
import { getReviewSummary, type SummaryEnv } from "../summaries/service";
import { pull, push } from "../sync/api";
import { type TodoEnv, todoAvailable } from "../todo/config";
import {
  connect as todoConnect,
  disconnect as todoDisconnect,
  done as todoDone,
  importFile as todoImportFile,
  list as todoList,
  refresh as todoRefresh,
} from "../todo/service";
import {
  apiError,
  clientIp,
  DEFAULT_MAX_INPUT_BYTES,
  json,
  readInput,
} from "./http";

export const API_PREFIX = "/api/";

export type ApiEnv = AlertsEnv & SummaryEnv & AuthEnv & ModerationEnv & TodoEnv;

interface Route<S extends z.ZodType> {
  input: S;
  /** Requests per IP per hour; omitted for signed-in routes limited per user. */
  perIpPerHour?: number;
  /**
   * Requests per signed-in person per hour (V2.md §12), for `auth: "user" |
   * "admin"` routes. Checked after the session and before the body is read.
   */
  perUserPerHour?: number;
  /** The largest request body read, in bytes (DEFAULT_MAX_INPUT_BYTES). */
  maxBytes?: number;
  /** Seat-alert routes answer "unavailable" while the flag is off. */
  alerts: boolean;
  /**
   * The route's own answer while seat alerts are off, sent before rate
   * limiting: the app asks for status on every load, and an off switch
   * shouldn't cost a D1 write per page view.
   */
  whenOff?: unknown;
  /**
   * Who may call it (V2.md §12). "user" and "admin" need a same-origin
   * request and a session (401 without, 403 for a non-admin), and the
   * handler gets `ctx.session`. Omitted means "none".
   */
  auth?: "none" | "user" | "admin";
  /** A plain value is sent as JSON; a Response (to set cookies) as is. */
  handle: (
    env: ApiEnv,
    input: z.infer<S>,
    ctx: RouteContext,
  ) => Promise<unknown>;
}

export type RouteContext = AlertsContext &
  IdentityRouteContext & {
    /** How the owner's moderation decisions reach Reviews and Chat. */
    moderationHandlers: ModerationHandlers;
  };

export interface ApiOptions {
  /** Outbound fetch for Google and pictures; tests mock it. */
  fetch?: typeof fetch;
  /** Overrides MODERATION_HANDLERS, for tests. */
  moderationHandlers?: ModerationHandlers;
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
    alerts: false,
    whenOff: { status: "unavailable" } satisfies SubscribeResult,
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
    alerts: false,
    whenOff: { status: "unavailable" } satisfies StatusResult,
    handle: (env, input) => status(env, input),
  }),
  // Identity (docs/AUTH.md). The sign-in navigations are GETs, routed below.
  me: route({
    input: MeInputSchema,
    perIpPerHour: 600,
    alerts: false,
    handle: (env, _input, ctx) =>
      me(env, ctx, {
        seatAlerts: alertsEnabled(env),
        todo: todoAvailable(env, isTestMode(env, new URL(ctx.request.url))),
      }),
  }),
  "auth/sign-out": route({
    input: SignOutInputSchema,
    perIpPerHour: 30,
    alerts: false,
    handle: (env, _input, ctx) => signOut(env, ctx),
  }),
  "account/delete": route({
    input: AccountDeleteInputSchema,
    perIpPerHour: 30,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => deleteAccount(env, ctx),
  }),
  "auth/test-sign-in": route({
    input: TestSignInInputSchema,
    perIpPerHour: 60,
    alerts: false,
    handle: (env, input, ctx) => testSignIn(env, input, ctx),
  }),
  // Plan sync (V2.md §5.3).
  "sync/push": route({
    input: SyncPushInputSchema,
    perUserPerHour: 1_200,
    maxBytes: SYNC_MAX_PUSH_REQUEST_BYTES,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => push(env, input, ctx),
  }),
  "sync/pull": route({
    input: SyncPullInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => pull(env, input, ctx),
  }),
  // Terpsicle Todo (docs/V3.md §3.8). Each answers "unavailable" while
  // TODO_ENABLED is off or the feed key is missing (outside test mode).
  "todo/connect": route({
    input: TodoConnectInputSchema,
    perIpPerHour: 30,
    perUserPerHour: 10,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoConnect(env, input, ctx),
  }),
  "todo/disconnect": route({
    input: TodoDisconnectInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => todoDisconnect(env, ctx),
  }),
  "todo/list": route({
    input: TodoListInputSchema,
    perUserPerHour: 600,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoList(env, input, ctx),
  }),
  "todo/done": route({
    input: TodoDoneInputSchema,
    perUserPerHour: 1_200,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoDone(env, input, ctx),
  }),
  "todo/refresh": route({
    input: TodoRefreshInputSchema,
    perUserPerHour: 30,
    alerts: false,
    auth: "user",
    handle: (env, _input, ctx) => todoRefresh(env, ctx),
  }),
  "todo/import-file": route({
    input: TodoImportFileInputSchema,
    perUserPerHour: 20,
    maxBytes: TODO_IMPORT_MAX_BYTES,
    alerts: false,
    auth: "user",
    handle: (env, input, ctx) => todoImportFile(env, input, ctx),
  }),
  // Moderation's admin side (docs/MODERATION.md §6).
  "admin/moderation/queue": route({
    input: QueueListInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input) => listQueue(env.DB, input),
  }),
  "admin/moderation/resolve": route({
    input: ResolveInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) =>
      resolveQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
      }),
  }),
  "admin/moderation/undo": route({
    input: UndoInputSchema,
    perIpPerHour: 600,
    alerts: false,
    auth: "admin",
    handle: (env, input, ctx) =>
      undoQueueItem(env.DB, input, {
        now: ctx.now,
        handlers: ctx.moderationHandlers,
      }),
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
  if (!r) return apiError("not-found");
  if (request.method !== "POST") return apiError("method-not-allowed");
  // JSON only: a cross-site form can't send this type without a CORS
  // preflight, which we never grant.
  if (!request.headers.get("Content-Type")?.includes("application/json")) {
    return apiError("invalid-input");
  }
  if (r.whenOff !== undefined && !alertsEnabled(env)) return json(r.whenOff);
  if (r.alerts && !alertsEnabled(env)) return apiError("unavailable");

  const window = { seconds: 3_600 };
  const limited = () => {
    const retryAfterSeconds = secondsLeft(window, now);
    return name === "alerts/subscribe"
      ? json({ status: "rate-limited", retryAfterSeconds })
      : apiError("rate-limited", retryAfterSeconds);
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
      (await hit(env.DB, `user:${session.user.id}:${name}`, window, now)) >
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
    moderationHandlers: options.moderationHandlers ?? MODERATION_HANDLERS,
  });
  return reply(result instanceof Response ? result : json(result));
}
